import { consequenciaDeAtivar, nomeDaClasse, ordenarModelos, temMetricas } from './modelos'
import { pode } from './permissoes'

describe('modelos da IA', () => {
  it('só ADMIN vê e ativa', () => {
    expect(pode('ADMIN', 'ver_modelos')).toBe(true)
    expect(pode('ADMIN', 'ativar_modelo')).toBe(true)
    expect(pode('TECNICO', 'ver_modelos')).toBe(false)
    expect(pode('OPERADOR', 'ativar_modelo')).toBe(false)
  })

  it('ativa primeiro, depois candidatas e arquivadas, a mais nova antes', () => {
    const m = (versao: number, estado: string) => ({ versao, estado })
    expect(
      ordenarModelos([m(1, 'arquivado'), m(3, 'candidato'), m(2, 'ativo'), m(4, 'candidato')]).map((x) => x.versao),
    ).toEqual([2, 4, 3, 1])
  })

  it('a frase de ativar diz o que muda e o que não muda', () => {
    expect(consequenciaDeAtivar(4, 2)).toBe(
      'A versão 4 passa a dar a segunda opinião nas próximas janelas. A versão 2, ativa hoje, vira arquivada. O modelo nunca muda estado, prioridade nem abertura de alerta.',
    )
    expect(consequenciaDeAtivar(1, null)).not.toContain('ativa hoje')
  })

  it('sem validação aplicável ou sem números: sem métricas', () => {
    expect(temMetricas({ aplicavel: false })).toBe(false)
    expect(temMetricas({ aplicavel: true, classificador: null, comparacao: null })).toBe(false)
    expect(temMetricas({ aplicavel: true, classificador: {} })).toBe(true)
    expect(nomeDaClasse('ferramenta_desgastada')).toBe('ferramenta desgastada')
    expect(nomeDaClasse('nova_classe')).toBe('nova classe')
  })
})
