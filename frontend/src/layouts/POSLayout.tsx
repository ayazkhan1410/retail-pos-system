import { Outlet } from 'react-router-dom';

export default function POSLayout() {
  return (
    <div className="h-[100dvh] overflow-hidden bg-brand-950">
      <Outlet />
    </div>
  );
}
