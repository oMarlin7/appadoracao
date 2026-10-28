import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from 'react-router'
import { Toaster, toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'
import { AppLayout } from './components/layout'
import { LogoMark } from './components/logo'
import { Button } from './components/ui/button'
import { ConfirmHost } from './components/ui/sheet'
import { ImageCropHost } from './components/image-cropper'
import { backend } from './lib/backend'
import { errorMessage } from './lib/actions'
import { syncPush } from './lib/push'
import { useData, useMe, useSession, useSettings } from './lib/store'
import { signOut } from './lib/auth'
import { startSync, stopSync } from './lib/sync'
import { AuthPage, NewPasswordPage } from './pages/auth'
import { HomePage } from './pages/home'
import { FavoritesPage, LibraryPage, MomentPage, ThemePage } from './pages/library'
import { NotFoundPage } from './pages/not-found'
import { ServicePage, ServicesPage } from './pages/services'
import { SongPage } from './pages/song'

// ---------------------------------------------------------------------------
// Tema claro/escuro
// ---------------------------------------------------------------------------

/** Tema do sistema — ou o que a página hospedeira impuser via `data-theme` (quando embutido). */
function systemPrefersDark(): boolean {
  const forced = document.documentElement.dataset.theme
  if (forced === 'dark' || forced === 'light') return forced === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function useThemeEffect() {
  const theme = useSettings((s) => s.theme)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(systemPrefersDark())
    mq.addEventListener('change', on)
    const observer = new MutationObserver(on)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', on)
      observer.disconnect()
    }
  }, [])
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0d0d17' : '#f6f5fb'))
  }, [dark])
  return dark
}

// ---------------------------------------------------------------------------
// Sessão + sincronização
// ---------------------------------------------------------------------------

function useAuthBootstrap() {
  const userId = useSession((s) => s.user?.id ?? null)

  useEffect(() => {
    let active = true
    backend
      .getUser()
      .then((u) => active && useSession.getState().setUser(u))
      .catch(() => active && useSession.getState().setUser(null))
    const unsub = backend.onAuthChange((u) => {
      const prev = useSession.getState().user?.id
      if (prev !== u?.id || useSession.getState().status === 'loading') useSession.getState().setUser(u)
    })
    return () => {
      active = false
      unsub()
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      stopSync()
      useData.getState().reset()
      return
    }
    useData.getState().setError(null)
    startSync(userId).catch((e) => useData.getState().setError(errorMessage(e)))
    void syncPush().catch(() => {})
    return () => stopSync()
  }, [userId])
}

function Splash({ text }: { text?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={64} className="animate-pulse" />
        {text && <p className="text-[14px] font-semibold text-muted">{text}</p>}
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status)
  const loaded = useData((s) => s.loaded)
  const error = useData((s) => s.error)
  const me = useMe()
  const location = useLocation()
  if (status === 'loading') return <Splash />
  if (status === 'signedOut') return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  if (!loaded) {
    if (error)
      return (
        <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
          <div className="max-w-sm">
            <LogoMark size={56} className="mx-auto" />
            <h1 className="mt-4 text-[20px] font-extrabold">Não conseguimos carregar</h1>
            <p className="mt-2 text-[14px] text-muted">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => void signOut()}>
                Sair
              </Button>
              <Button icon={RefreshCw} onClick={() => window.location.reload()}>
                Tentar de novo
              </Button>
            </div>
          </div>
        </div>
      )
    return <Splash text="Carregando o repertório…" />
  }
  if (!me)
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
        <div className="max-w-sm">
          <LogoMark size={56} className="mx-auto" />
          <h1 className="mt-4 text-[20px] font-extrabold">Perfil não encontrado</h1>
          <p className="mt-2 text-[14px] text-muted">Sua conta existe, mas o perfil na equipe não foi criado. Fale com o líder do ministério.</p>
          <Button className="mt-5" variant="outline" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </div>
    )
  return <>{children}</>
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

const hideNav = { hideNav: true }

// Telas usadas com menos frequência são carregadas sob demanda (o service worker guarda
// todas para uso offline).
const lazyPage = <M,>(load: () => Promise<M>, pick: (m: M) => ComponentType) => async () => ({ Component: pick(await load()) })
const live = (source: 'service' | 'playlist' | 'song') =>
  lazyPage(
    () => import('./pages/live'),
    (m) =>
      function Live() {
        return <m.LivePage source={source} />
      },
  )

/** Endereços antigos (/acervo…) continuam abrindo a página certa. */
function LegacyLibraryRedirect() {
  const { pathname, search } = useLocation()
  return <Navigate to={pathname.replace(/^\/acervo/, '/musicas') + search} replace />
}

const router = createBrowserRouter([
  { path: '/entrar', element: <AuthPage /> },
  { path: '/nova-senha', element: <NewPasswordPage /> },
  {
    element: (
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    ),
    hydrateFallbackElement: <Splash />,
    children: [
      { path: '/cultos/:id/ao-vivo', lazy: live('service') },
      { path: '/playlists/:id/tocar', lazy: live('playlist') },
      { path: '/musica/:id/palco', lazy: live('song') },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'musicas', element: <LibraryPage /> },
          { path: 'acervo/*', element: <LegacyLibraryRedirect /> },
          { path: 'musicas/tema/:themeId', element: <ThemePage /> },
          { path: 'musicas/momento/:momentId', element: <MomentPage /> },
          { path: 'favoritas', element: <FavoritesPage /> },
          { path: 'musica/nova', lazy: lazyPage(() => import('./pages/song-editor'), (m) => m.SongEditorPage), handle: hideNav },
          { path: 'musica/:id', element: <SongPage />, handle: hideNav },
          { path: 'musica/:id/editar', lazy: lazyPage(() => import('./pages/song-editor'), (m) => m.SongEditorPage), handle: hideNav },
          { path: 'cultos', element: <ServicesPage /> },
          { path: 'cultos/novo', lazy: lazyPage(() => import('./pages/service-editor'), (m) => m.ServiceEditorPage), handle: hideNav },
          { path: 'cultos/:id', element: <ServicePage /> },
          { path: 'cultos/:id/editar', lazy: lazyPage(() => import('./pages/service-editor'), (m) => m.ServiceEditorPage), handle: hideNav },
          { path: 'sugestoes', lazy: lazyPage(() => import('./pages/suggestions'), (m) => m.SuggestionsPage) },
          { path: 'playlists', lazy: lazyPage(() => import('./pages/playlists'), (m) => m.PlaylistsPage) },
          { path: 'playlists/:id', lazy: lazyPage(() => import('./pages/playlists'), (m) => m.PlaylistPage) },
          { path: 'chat', lazy: lazyPage(() => import('./pages/chat'), (m) => m.ChatPage), handle: hideNav },
          { path: 'assistente', lazy: lazyPage(() => import('./pages/assistant'), (m) => m.AssistantPage) },
          { path: 'perfil', lazy: lazyPage(() => import('./pages/profile'), (m) => m.ProfilePage) },
          { path: 'equipe', lazy: lazyPage(() => import('./pages/profile'), (m) => m.TeamPage) },
          { path: 'ajustes', lazy: lazyPage(() => import('./pages/profile'), (m) => m.SettingsPage) },
          { path: 'ensaios', lazy: lazyPage(() => import('./pages/rehearsals'), (m) => m.RehearsalsPage) },
          { path: 'presenca', lazy: lazyPage(() => import('./pages/attendance'), (m) => m.AttendancePage) },
          { path: 'temas', lazy: lazyPage(() => import('./pages/themes'), (m) => m.ThemesPage) },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

// ---------------------------------------------------------------------------
// Atualização do app (PWA)
// ---------------------------------------------------------------------------

function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  useEffect(() => {
    if (!needRefresh) return
    toast('Nova versão disponível ✨', {
      description: 'Toque em Atualizar pra ver as novidades (de preferência fora do culto 😉).',
      duration: Infinity,
      action: { label: 'Atualizar', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])
  return null
}

export function App() {
  const dark = useThemeEffect()
  useAuthBootstrap()
  return (
    <>
      <RouterProvider router={router} />
      <ConfirmHost />
      <ImageCropHost />
      <PwaUpdater />
      <Toaster
        position="top-center"
        theme={dark ? 'dark' : 'light'}
        offset={16}
        toastOptions={{
          classNames: {
            toast: '!rounded-2xl !border-line !bg-surface !text-ink !shadow-pop !font-sans',
            description: '!text-muted',
            actionButton: '!bg-primary !text-primary-ink !rounded-full !font-bold',
          },
        }}
      />
    </>
  )
}
