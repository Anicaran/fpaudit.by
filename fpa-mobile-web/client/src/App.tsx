import { SessionProvider, useSession } from './context/SessionContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { MainLayout } from './components/MainLayout';
import { ShopPickerDialog } from './components/ShopPickerDialog';
import { Toast } from './components/Toast';

function AppContent() {
  const { session, shopPickerShops, pickShopFromDialog, closeShopPicker } = useSession();

  return (
    <div id="app">
      <ErrorBoundary>
        {session?.token ? <MainLayout /> : <LoginScreen />}
      </ErrorBoundary>
      {shopPickerShops ? (
        <ShopPickerDialog shops={shopPickerShops} onPick={pickShopFromDialog} onClose={closeShopPicker} />
      ) : null}
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <AppContent />
      </SessionProvider>
    </ToastProvider>
  );
}
