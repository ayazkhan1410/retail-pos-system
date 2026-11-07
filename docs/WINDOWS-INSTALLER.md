# Tijori POS on Windows

## Get the installer

Open the repository's **Actions** tab, choose **Windows installer**, and open the successful run for your commit. Download **Tijori-POS-Windows**, extract it, and double-click **Tijori-POS-Setup.exe** on a Windows x64 shop computer. The installer requests administrator access to install the local service and its private-network firewall rule. The daily register runs as a regular Windows user.

## Set up the first counter

1. Choose the installation folder under Program Files and finish the installer.
2. Open **Tijori POS**. Choose English or Urdu, enter the store and owner details, and select the number of counters.
3. Confirm creation of the new shop database. Sign in with the owner email and password when the wizard finishes.
4. On another till, open the address shown under **Tijori → Connect another counter** in Chrome. Keep the main PC on, with Tijori open and the shop network set to Private.

The installation uses a dedicated PostgreSQL cluster. It records first-run approval for the existing migrations and uses the same managed database for future version upgrades. The register normally uses port 8000 and records the available port it actually opened.

## Shop data and updates

Shop data lives in `%PROGRAMDATA%\Tijori`. The `backups` directory contains SQL dumps, and `logs` contains service and server diagnostics. The Windows service keeps one daily backup per shop date for 14 days. Manual and pre-update backups are kept separately. Copy backups to a second device for recovery after a disk failure.

Update checks use GitHub Releases. To distribute a tested version, publish the matching version tag, installer, blockmap, and `latest.yml` together. Versions must increase for the updater to offer a release. Ordinary application exit leaves a downloaded update pending. Before an approved upgrade the service stops accepting sales, finishes a database backup, and then starts installation. An uninstall keeps the database and backups by default.

## Build from a clone

The complete build sequence and version pins are in `.github/workflows/windows-installer.yml`. It builds the frontend, compiles the Django server and service, verifies the PostgreSQL archive's SHA-256, tests against a disposable database and builds the NSIS installer. After staging the server and PostgreSQL, run `desktop/scripts/stage-vc-runtime.ps1` on the build machine with Visual Studio's x64 C++ redistributable files installed. This bundles the Microsoft runtime needed on a fresh shop PC. The installed smoke test runs only on a clean GitHub-hosted Windows runner. Optional repository secrets `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` enable certificate signing.

## Physical Windows acceptance

Test every candidate on a real Windows PC before giving it to a shop. Record the commit, installer SHA-256, Windows version and result. Use a fresh test installation and disposable shop data.

- Complete installation, open the English and Urdu wizard screens, and create an owner with one counter.
- Sign in under a standard Windows account, open a shift, scan an item, finish a sale, and print its receipt with the shop hardware.
- Restart Windows and sign in again. Verify the sale and counter remain available. Open the till on a second PC using the private LAN address.
- Run a backup, verify that it restores into a separate test database, and exercise the update flow using two distinct test versions.
- Close Tijori and verify its HTTP listener and PostgreSQL stop. Uninstall with the default choice, reinstall, and sign in to the retained shop.
