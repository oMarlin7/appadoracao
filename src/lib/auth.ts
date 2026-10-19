import { backend } from './backend'
import { forgetDevice } from './push'
import { useData, useSession } from './store'
import { clearLocalCache, stopSync } from './sync'

export async function signOut() {
  const id = useSession.getState().user?.id ?? null
  await forgetDevice()
  stopSync()
  await backend.signOut()
  await clearLocalCache(id)
  useData.getState().reset()
  useSession.getState().setUser(null)
}
