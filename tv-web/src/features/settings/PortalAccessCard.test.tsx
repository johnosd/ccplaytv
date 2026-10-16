import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { PortalRequestError } from '../../lib/portal/portalClient'
import { PortalConnection } from '../../lib/portal/portalConnection'
import { usePairingCredentials } from '../../lib/portal/usePairingCredentials'
import { PortalAccessCard } from './PortalAccessCard'

const databases: CatalogDb[] = []
afterEach(async () => { cleanup(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

function Harness({ connection }: { connection?: PortalConnection }) {
  const pairing = usePairingCredentials(connection)
  return <PortalAccessCard connected={!!connection} pairing={pairing} retryFocused onRetry={() => void pairing.retry()} />
}
function unpairedConnection() {
  const db = new CatalogDb('test-075-card-' + crypto.randomUUID()); databases.push(db)
  return new PortalConnection(db, { request: vi.fn() as never }, 'https://portal.test', () => 'fixture-duid')
}

it('falha do cadastro mostra só o código não secreto e o botão Tentar de novo chama ensurePairing outra vez', async () => {
  const connection = unpairedConnection()
  const ensure = vi.spyOn(connection, 'ensurePairing').mockRejectedValueOnce(new PortalRequestError('service_unavailable'))
  render(<Harness connection={connection} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar ao portal')
  expect(screen.getByText('Código do erro: service_unavailable')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  ensure.mockImplementationOnce(() => new Promise(() => {}))
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  expect(ensure).toHaveBeenCalledTimes(2)
  expect(await screen.findByText('Preparando o acesso pelo celular…')).toBeInTheDocument()
})

it('conflito de vínculo aponta a recuperação pelo site', async () => {
  const connection = unpairedConnection()
  vi.spyOn(connection, 'ensurePairing').mockRejectedValue(new PortalRequestError('conflict'))
  render(<Harness connection={connection} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um vínculo para esta TV')
})

it('TV sem o ID/chave da 070 mostra carregando até o upgrade terminar', async () => {
  const connection = unpairedConnection()
  let finish!: () => void
  vi.spyOn(connection, 'ensurePairing').mockImplementation(() => new Promise(resolve => { finish = () => resolve(undefined as never) }))
  render(<Harness connection={connection} />)
  expect(await screen.findByText('Preparando o acesso pelo celular…')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  await act(async () => finish())
  expect(await screen.findByText(/não está vinculada ao portal/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Vincular de novo' })).toBeInTheDocument()
})

it('sem portal configurado explica e não mostra QR, ID nem chave', () => {
  render(<Harness />)
  expect(screen.getByText(/O portal ainda não está disponível neste app/)).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('o convite de recuperação ocupa o lugar do QR fixo, com a contagem regressiva', () => {
  const pairing = { state: 'ready', device: undefined, qrUrl: undefined, site: undefined, code: undefined, retry: vi.fn() } as never
  render(<PortalAccessCard connected pairing={pairing} retryFocused={false} onRetry={vi.fn()}
    recovery={{ qrDataUrl: 'data:image/png;base64,aGVsbG8=', seconds: 42 }} />)
  expect(screen.getByRole('img', { name: 'QR temporário de recuperação desta TV' })).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'QR de acesso ao portal desta TV' })).not.toBeInTheDocument()
  expect(screen.getByText('QR válido por 42 segundos')).toBeInTheDocument()
})
