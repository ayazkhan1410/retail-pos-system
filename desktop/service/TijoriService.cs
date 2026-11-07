using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

// The desktop UI never reads database credentials. This service runs as NT SERVICE\TijoriRuntime.
internal sealed class TijoriService : ServiceBase {
    const string NameOfService = "TijoriRuntime";
    const string PipeName = "pk.tijori.pos.runtime.v1";
    const int MaxRequest = 32768;
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    readonly object sync = new object();
    NamedPipeServerStream pipe;
    Process worker;
    IntPtr job;
    volatile bool stopping;
    string root;
    string resources;

    TijoriService() { ServiceName = NameOfService; CanShutdown = true; }

    static void Main(string[] args) {
        if (args.Length == 1 && args[0] == "--client") {
            string stage = "opening redirected input and output";
            try {
                using (var input = ParentStream(-10, FileAccess.Read))
                using (var output = ParentStream(-11, FileAccess.Write))
                using (var client = new NamedPipeClientStream(".", PipeName, PipeAccessRights.ReadWrite,
                           PipeOptions.None, TokenImpersonationLevel.Identification, HandleInheritability.None)) {
                    stage = "connecting to the shop service";
                    client.Connect(15000);
                    stage = "verifying the shop service";
                    uint pid;
                    if (!GetNamedPipeServerProcessId(client.SafePipeHandle, out pid) || pid != ServicePid())
                        throw new IOException("Tijori could not verify the local Windows service.");
                    stage = "exchanging the service request";
                    string request = ReadLine(input, MaxRequest);
                    WriteLine(client, request);
                    WriteLine(output, ReadLine(client, MaxRequest));
                }
            } catch (Exception ex) {
                Environment.ExitCode = 1;
                try {
                    using (var error = ParentStream(-12, FileAccess.Write))
                        WriteLine(error, "Tijori failed while " + stage + ": " + ex.Message);
                } catch (IOException) { } // The parent may already have closed stderr.
            }
            return;
        }
        Run(new TijoriService());
    }

    // A hidden Windows executable inherits ordinary pipes. Console encoding APIs require a console.
    static Stream ParentStream(int standardHandle, FileAccess access) {
        var handle = new SafeFileHandle(GetStdHandle(standardHandle), false);
        if (handle.IsInvalid) throw new IOException("The parent did not supply a valid redirected stream.");
        return new FileStream(handle, access);
    }
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int standardHandle);

    protected override void OnStart(string[] args) {
        root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Tijori");
        resources = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(true, false);
        AddRule(security, WellKnownSidType.NetworkSid, PipeAccessRights.FullControl, AccessControlType.Deny);
        AddRule(security, WellKnownSidType.InteractiveSid, PipeAccessRights.ReadWrite, AccessControlType.Allow);
        AddRule(security, WellKnownSidType.BuiltinAdministratorsSid, PipeAccessRights.ReadWrite, AccessControlType.Allow);
        AddRule(security, WellKnownSidType.LocalSystemSid, PipeAccessRights.FullControl, AccessControlType.Allow);
        security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
        pipe = new NamedPipeServerStream(PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
                   PipeOptions.Asynchronous, MaxRequest, MaxRequest, security);
        StartWorker();
        new Thread(Listen) { IsBackground = true }.Start();
    }
    static void AddRule(PipeSecurity acl, WellKnownSidType sid, PipeAccessRights rights, AccessControlType type) {
        acl.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(sid, null), rights, type));
    }

    void StartWorker() {
        job = CreateKillJob();
        var start = new ProcessStartInfo(Path.Combine(resources, "server", "tijori-server.exe"), "--desktop-worker");
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.WorkingDirectory = Path.Combine(resources, "server");
        start.RedirectStandardInput = start.RedirectStandardOutput = start.RedirectStandardError = true;
        start.StandardOutputEncoding = start.StandardErrorEncoding = Utf8;
        string sealedPath = Path.Combine(root, "state", "runtime.dpapi");
        byte[] bytes = ProtectedData.Unprotect(File.ReadAllBytes(sealedPath), null, DataProtectionScope.LocalMachine);
        try {
            foreach (var line in Utf8.GetString(bytes).Split('\n')) {
                int equal = line.IndexOf('=');
                if (equal > 0) start.EnvironmentVariables[line.Substring(0, equal)] = line.Substring(equal + 1).TrimEnd('\r');
            }
        } finally { Array.Clear(bytes, 0, bytes.Length); }
        start.EnvironmentVariables["TIJORI_RESOURCES"] = resources;
        start.EnvironmentVariables["TIJORI_DATA_DIR"] = root;
        start.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
        start.EnvironmentVariables["APP_VERSION"] = FileVersionInfo.GetVersionInfo(
            Path.Combine(resources, "..", "Tijori POS.exe")).ProductVersion;
        worker = new Process { StartInfo = start };
        worker.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) {
            if (e.Data != null) Log(e.Data);
        };
        worker.Start();
        if (!AssignProcessToJobObject(job, worker.Handle)) {
            worker.Kill();
            throw new Win32Exception();
        }
        worker.BeginErrorReadLine();
    }

    void Log(string msg) {
        try { File.AppendAllText(Path.Combine(root, "logs", "service.log"), DateTime.Now.ToString("s") + " " + msg + Environment.NewLine); }
        catch (IOException) { }
    }
    void Listen() {
        while (!stopping) {
            try {
                pipe.WaitForConnection();
                // Limit idle/malformed callers without timing out an active setup or backup.
                string request;
                var reading = System.Threading.Tasks.Task.Factory.StartNew(() => ReadLine(pipe, MaxRequest));
                if (!reading.Wait(10000)) {
                    pipe.Disconnect();
                    try { reading.Wait(); } catch (AggregateException) { }
                    continue;
                }
                request = reading.Result;
                string reply;
                lock (sync) {
                    if (stopping) return;
                    if (worker.HasExited) {
                        CloseHandle(job); job = IntPtr.Zero;
                        worker.Dispose();
                        StartWorker();
                    }
                    WriteLine(worker.StandardInput.BaseStream, request);
                    reply = worker.StandardOutput.ReadLine();
                    if (reply == null) throw new IOException("Tijori runtime exited.");
                }
                WriteLine(pipe, reply);
            } catch (Exception ex) {
                if (!stopping) Log(ex.Message);
            } finally {
                try { if (pipe.IsConnected) pipe.Disconnect(); } catch (ObjectDisposedException) { }
            }
        }
    }
    static string ReadLine(Stream stream, int max) {
        using (var buffer = new MemoryStream()) {
            for (int i = 0; i <= max; ++i) {
                int b = stream.ReadByte();
                if (b == '\n' || (b == -1 && buffer.Length > 0)) return Utf8.GetString(buffer.ToArray());
                if (b == -1) throw new EndOfStreamException();
                buffer.WriteByte((byte)b);
            }
        }
        throw new InvalidDataException("Message exceeds size limit.");
    }
    static void WriteLine(Stream stream, string value) {
        byte[] data = Utf8.GetBytes(value + "\n");
        stream.Write(data, 0, data.Length); stream.Flush();
    }
    protected override void OnShutdown() { StopWorker(); }
    protected override void OnStop() {
        try { RequestAdditionalTime(120000); }
        finally { StopWorker(); }
    }
    void StopWorker() {
        stopping = true;
        if (pipe != null) pipe.Dispose();
        lock (sync) {
            try {
                if (worker != null && !worker.HasExited) {
                    worker.StandardInput.Close();
                    worker.WaitForExit(90000);
                }
            } finally {
                if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
            }
        }
    }

    // A service crash must not leave an orphaned HTTP server or database listening.
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long processTime, jobTime; public uint flags;
        public UIntPtr minWorking, maxWorking; public uint processes; public UIntPtr affinity; public uint priority, scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct JobLimits {
        public BasicLimits basic; public ulong reads, writes, others, bytesRead, bytesWritten, otherBytes;
        public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
    }
    static IntPtr CreateKillJob() {
        var handle = CreateJobObject(IntPtr.Zero, null);
        var limits = new JobLimits(); limits.basic.flags = 0x2000;
        if (handle == IntPtr.Zero || !SetInformationJobObject(handle, 9, ref limits, Marshal.SizeOf(limits)))
            throw new Win32Exception();
        return handle;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr acl, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref JobLimits limits, int size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetNamedPipeServerProcessId(SafePipeHandle handle, out uint pid);
    [StructLayout(LayoutKind.Sequential)] struct Status {
        public uint type, state, controls, exitCode, specific, checkpoint, wait, pid, flags;
    }
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr OpenSCManager(string machine, string database, uint access);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr OpenService(IntPtr scm, string name, uint access);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool QueryServiceStatusEx(IntPtr service, int kind, out Status status, int size, out uint needed);
    [DllImport("advapi32.dll")] static extern bool CloseServiceHandle(IntPtr handle);
    static uint ServicePid() {
        var scm = OpenSCManager(null, null, 1);
        if (scm == IntPtr.Zero) throw new Win32Exception();
        try {
            var handle = OpenService(scm, NameOfService, 4);
            if (handle == IntPtr.Zero) throw new Win32Exception();
            try {
                Status status; uint needed;
                if (!QueryServiceStatusEx(handle, 0, out status, Marshal.SizeOf(typeof(Status)), out needed))
                    throw new Win32Exception();
                return status.pid;
            } finally { CloseServiceHandle(handle); }
        } finally { CloseServiceHandle(scm); }
    }
}
