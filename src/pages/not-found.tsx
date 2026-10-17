import { Compass } from 'lucide-react'
import { Page } from '@/components/layout'
import { LinkButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/primitives'

export function NotFoundPage() {
  return (
    <Page>
      <EmptyState
        icon={Compass}
        title="Página não encontrada"
        description="O endereço pode ter mudado ou o conteúdo foi removido."
        action={<LinkButton to="/">Voltar ao início</LinkButton>}
        className="py-24"
      />
    </Page>
  )
}
