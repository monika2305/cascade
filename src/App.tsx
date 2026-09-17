import { useState, useEffect } from 'react';
import type { UserRole, InfrastructureDataset } from './types/infrastructure';
import LandingPage from './landing/LandingPage';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar, type ScreenId } from './components/Sidebar';
import { UploadScreen } from './components/UploadScreen';
import { NetworkScreen } from './components/NetworkScreen';
import { WeakPointsScreen } from './components/WeakPointsScreen';
import { FailureTestScreen } from './components/FailureTestScreen';
import { ActionLabScreen } from './components/ActionLabScreen';
import { CityResilienceCommandScreen } from './components/CityResilienceCommandScreen';
import { CityTwinScreen } from './components/CityTwinScreen';
import { AiAssistant } from './components/AiAssistant';
import { ErrorBoundary } from './components/ErrorBoundary';

interface UserSession {
  name: string;
  role: UserRole;
}

export function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.pathname) {
      return window.location.pathname;
    }
    return '/';
  });
  const [user, setUser] = useState<UserSession | null>(null);
  const [activeScreen, setActiveScreen] = useState<ScreenId>('upload');
  const [dataset, setDataset] = useState<InfrastructureDataset | null>(null);
  const [selectedFailureAssetId, setSelectedFailureAssetId] = useState<string | null>(null);

  // Sync browser back/forward history navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setCurrentPath(path);
  };

  const handleLogin = (name: string, role: UserRole) => {
    setUser({ name, role });
    setActiveScreen('upload');
    navigateTo('/dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setDataset(null);
    setActiveScreen('upload');
    setSelectedFailureAssetId(null);
    navigateTo('/login');
  };

  const handleDatasetLoaded = (newDataset: InfrastructureDataset) => {
    setDataset(newDataset);
  };

  const handleViewNetwork = () => {
    setActiveScreen('network');
  };

  const handleSelectForFailureTest = (assetId: string) => {
    setSelectedFailureAssetId(assetId);
    setActiveScreen('failure-test');
  };

  // Route 1 — Cinematic Landing Page (/ or default unauthenticated root)
  if (!user && (currentPath === '/' || currentPath === '' || currentPath === '/index.html')) {
    return (
      <LandingPage
        exploreHref="/login"
        onExplore={() => navigateTo('/login')}
      />
    );
  }

  // Route 2 — Login Screen (/login or non-root unauthenticated route)
  if (!user) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onBackToLanding={() => navigateTo('/')}
      />
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex font-sans overflow-hidden">
      {/* Left Navigation Sidebar */}
      <Sidebar
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        userName={user.name}
        userRole={user.role}
        hasData={dataset !== null}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 h-full relative overflow-hidden bg-slate-950 flex flex-col">
        <ErrorBoundary key={activeScreen} fallbackMessage="The current view could not be displayed.">
          {/* S2 — HOME / UPLOAD */}
          {activeScreen === 'upload' && (
            <UploadScreen
              userName={user.name}
              dataset={dataset}
              onDatasetLoaded={handleDatasetLoaded}
              onViewNetwork={handleViewNetwork}
            />
          )}

          {/* S3 — CITY NETWORK */}
          {activeScreen === 'network' && dataset && (
            <NetworkScreen dataset={dataset} />
          )}

          {/* S4 — WEAK POINTS */}
          {activeScreen === 'weak-points' && dataset && (
            <WeakPointsScreen
              dataset={dataset}
              onSelectForFailureTest={handleSelectForFailureTest}
            />
          )}

          {/* S5 — FAILURE TEST */}
          {activeScreen === 'failure-test' && dataset && (
            <FailureTestScreen
              dataset={dataset}
              initialAssetId={selectedFailureAssetId}
            />
          )}

          {/* CITY RESILIENCE COMMAND */}
          {activeScreen === 'command' && dataset && (
            <CityResilienceCommandScreen
              dataset={dataset}
              userRole={user.role}
              initialFailureId={selectedFailureAssetId}
              onSelectFailureId={(assetId) => setSelectedFailureAssetId(assetId)}
              onNavigateToActionLab={(assetId) => {
                setSelectedFailureAssetId(assetId);
                setActiveScreen('action-lab');
              }}
              onNavigateToFailureTest={(assetId) => {
                setSelectedFailureAssetId(assetId);
                setActiveScreen('failure-test');
              }}
            />
          )}

          {/* CITY TWIN */}
          {activeScreen === 'city-twin' && dataset && (
            <CityTwinScreen
              dataset={dataset}
              selectedFailureId={selectedFailureAssetId}
              onSelectFailureId={(assetId) => setSelectedFailureAssetId(assetId)}
              onNavigateToFailureTest={(assetId) => {
                if (assetId) setSelectedFailureAssetId(assetId);
                setActiveScreen('failure-test');
              }}
              onNavigateToHome={() => setActiveScreen('upload')}
            />
          )}

          {/* S6 — ACTION LAB */}
          {activeScreen === 'action-lab' && dataset && (
            <ActionLabScreen
              dataset={dataset}
              initialFailureId={selectedFailureAssetId}
            />
          )}

          {/* Fallback if navigated to a data screen without dataset */}
          {activeScreen !== 'upload' && !dataset && (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="text-slate-400 text-sm mb-4">
                Please upload or load sample infrastructure data first.
              </div>
              <button
                onClick={() => setActiveScreen('upload')}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg transition-colors cursor-pointer"
              >
                Go to Upload
              </button>
            </div>
          )}
        </ErrorBoundary>

        {/* CASCADE AI Robot Assistant Copilot */}
        <AiAssistant
          dataset={dataset}
          activeScreen={activeScreen}
          selectedFailureId={selectedFailureAssetId}
          onNavigateToScreen={(screen, assetId) => {
            if (assetId) setSelectedFailureAssetId(assetId);
            setActiveScreen(screen);
          }}
          onSelectAsset={(assetId) => {
            setSelectedFailureAssetId(assetId);
          }}
        />
      </main>
    </div>
  );
}

export default App;
