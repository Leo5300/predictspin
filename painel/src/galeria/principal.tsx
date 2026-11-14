import '../index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { aplicarTema, obterTema } from '@/estado/preferencias'

import { Galeria } from './Galeria'

aplicarTema(obterTema())

const raiz = document.getElementById('galeria')
if (!raiz) throw new Error('Elemento #galeria ausente em galeria.html')

createRoot(raiz).render(
  <StrictMode>
    <Galeria />
  </StrictMode>,
)
