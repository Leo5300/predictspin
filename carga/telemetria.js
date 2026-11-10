// Teste de carga da API com k6: ingestão de telemetria mais consultas.
//
// As janelas enviadas aqui são SIMULADAS (dispositivo ps-sim-01, valores sorteados). Servem para
// medir o servidor e nunca substituem medição. Ficam gravadas com a marca "simulado".
//
// Uso (detalhes em docs/teste-de-carga.md):
//   k6 run -e BASE_URL=http://localhost:8080 -e DISPOSITIVO_SIM_CHAVE=... \
//          -e ADMIN_EMAIL=... -e ADMIN_SENHA=... carga/telemetria.js
//
// Variáveis (-e NOME=valor ou variável de ambiente):
//   BASE_URL               endereço da API (padrão http://localhost:8080)
//   DISPOSITIVO_SIM_CHAVE  chave do dispositivo simulado (obrigatória)
//   ADMIN_EMAIL, ADMIN_SENHA  usuário ADMIN ou TECNICO usado nas consultas (obrigatórios)
//   DISPOSITIVO            identificador do dispositivo (padrão ps-sim-01)
//   MAQUINA                código da máquina consultada (padrão TORNO-01)
//   DURACAO_S              duração de cada cenário em segundos (padrão 60)
//   PAUSA_S                espera de cada usuário virtual entre iterações (padrão 1)
//   CENARIO                "20", "50" ou vazio para rodar os dois em sequência

import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const DISPOSITIVO = __ENV.DISPOSITIVO || 'ps-sim-01';
const MAQUINA = __ENV.MAQUINA || 'TORNO-01';
const DURACAO_S = parseInt(__ENV.DURACAO_S || '60', 10);
const PAUSA_S = parseFloat(__ENV.PAUSA_S || '1');
const CENARIO = __ENV.CENARIO || '';
const INTERVALO_ENTRE_CENARIOS_S = 10;

const janelasNovas = new Counter('janelas_novas');
const janelasDuplicadas = new Counter('janelas_duplicadas');

function cenario(vus, inicioS) {
  return {
    executor: 'constant-vus',
    vus: vus,
    duration: `${DURACAO_S}s`,
    startTime: `${inicioS}s`,
    gracefulStop: '10s',
    tags: { carga: `${vus}vus` },
  };
}

function montarCenarios() {
  if (CENARIO === '20') return { vus20: cenario(20, 0) };
  if (CENARIO === '50') return { vus50: cenario(50, 0) };
  if (CENARIO !== '') throw new Error('CENARIO deve ser 20, 50 ou vazio');
  return {
    vus20: cenario(20, 0),
    vus50: cenario(50, DURACAO_S + INTERVALO_ENTRE_CENARIOS_S),
  };
}

// Metas: p95 abaixo de 500 ms e menos de 1% de erro, no total, por carga e por tipo de chamada.
function montarMetas(cenarios) {
  const metas = {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{tipo:ingestao}': ['p(95)<500'],
    'http_req_duration{tipo:consulta}': ['p(95)<500'],
  };
  for (const nome of Object.keys(cenarios)) {
    const carga = cenarios[nome].tags.carga;
    metas[`http_req_duration{carga:${carga}}`] = ['p(95)<500'];
    metas[`http_req_failed{carga:${carga}}`] = ['rate<0.01'];
  }
  return metas;
}

const cenarios = montarCenarios();

export const options = {
  scenarios: cenarios,
  thresholds: montarMetas(cenarios),
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Roda uma vez antes da carga: confere a API, entra e descobre a máquina e os pontos.
export function setup() {
  const chave = __ENV.DISPOSITIVO_SIM_CHAVE;
  const email = __ENV.ADMIN_EMAIL;
  const senha = __ENV.ADMIN_SENHA;
  if (!chave) fail('Defina DISPOSITIVO_SIM_CHAVE');
  if (!email || !senha) fail('Defina ADMIN_EMAIL e ADMIN_SENHA');

  // A instância gratuita do Render pode estar hibernada: espera a API acordar antes de medir.
  let saude;
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    saude = http.get(`${BASE_URL}/actuator/health`, { timeout: '30s' });
    if (saude.status === 200) break;
    sleep(5);
  }
  if (!saude || saude.status !== 200) fail(`API fora do ar em ${BASE_URL}`);

  const login = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({ email: email, senha: senha }),
    { headers: { 'Content-Type': 'application/json' } });
  if (login.status !== 200) fail(`Login recusado (${login.status})`);
  const autorizacao = { Authorization: `Bearer ${login.json('token')}` };

  const maquinas = http.get(`${BASE_URL}/api/v1/maquinas?size=200`, { headers: autorizacao });
  const maquina = (maquinas.json('conteudo') || []).find((m) => m.codigo === MAQUINA);
  if (!maquina) fail(`Máquina ${MAQUINA} não encontrada`);

  const pontos = http.get(`${BASE_URL}/api/v1/maquinas/${maquina.id}/pontos?size=200`, { headers: autorizacao });
  const idsDosPontos = (pontos.json('conteudo') || []).map((p) => p.id);
  if (idsDosPontos.length === 0) fail(`Máquina ${MAQUINA} sem pontos de medição`);

  return { chave: chave, autorizacao: autorizacao, maquinaId: maquina.id, pontos: idsDosPontos };
}

function sortear(minimo, maximo) {
  return minimo + Math.random() * (maximo - minimo);
}

function arredondar(valor, casas) {
  const fator = Math.pow(10, casas);
  return Math.round(valor * fator) / fator;
}

function medida(base) {
  const o1x = base * sortear(0.9, 1.1);
  const rms = o1x * sortear(0.75, 0.95);
  return {
    rms_g: arredondar(rms, 5),
    pico_g: arredondar(rms * sortear(1.5, 2.2), 5),
    curtose: arredondar(sortear(1.6, 3.4), 4),
    o1x: arredondar(o1x, 5),
    o2x: arredondar(o1x * 0.3, 5),
    o3x: arredondar(o1x * 0.12, 5),
  };
}

// medido_em único por requisição: relógio em milissegundos e, nos três dígitos de microssegundo,
// o número do usuário virtual. Assim cada envio grava uma janela nova (não cai no reenvio).
function instanteUnico() {
  const micros = String(exec.vu.idInTest % 1000).padStart(3, '0');
  return new Date().toISOString().replace('Z', `${micros}Z`);
}

function payload() {
  const rotacao = sortear(380, 1250);
  const base = 0.04 * Math.pow(rotacao / 1000, 2);
  return {
    dispositivo: DISPOSITIVO,
    medido_em: instanteUnico(),
    rotacao_rpm: arredondar(rotacao, 1),
    saturou: false,
    pontos: { A: medida(base), B: medida(base * 0.6), C: medida(base * 0.4) },
    canais: {
      temp_cabecote_c: arredondar(sortear(38, 46), 2),
      temp_ferramenta_c: arredondar(sortear(28, 40), 2),
      amb_temp_c: arredondar(sortear(23, 25), 2),
      amb_umid_pct: arredondar(sortear(50, 60), 1),
      corrente_a: arredondar(sortear(3, 6), 3),
    },
  };
}

function enviarJanela(dados) {
  const resposta = http.post(`${BASE_URL}/api/v1/telemetria`, JSON.stringify(payload()), {
    headers: {
      'Content-Type': 'application/json',
      'X-Dispositivo-Id': DISPOSITIVO,
      'X-Dispositivo-Chave': dados.chave,
    },
    tags: { tipo: 'ingestao', name: 'POST /telemetria' },
  });
  check(resposta, { 'ingestão aceita (200 ou 201)': (r) => r.status === 200 || r.status === 201 });
  if (resposta.status === 201) janelasNovas.add(1);
  if (resposta.status === 200) janelasDuplicadas.add(1);
}

function consultar(dados) {
  const parametros = (nome) => ({ headers: dados.autorizacao, tags: { tipo: 'consulta', name: nome } });
  const escolha = exec.scenario.iterationInTest % 3;
  let resposta;
  if (escolha === 0) {
    resposta = http.get(`${BASE_URL}/api/v1/maquinas/${dados.maquinaId}/ultima-janela?simulado=true`,
      parametros('GET /maquinas/{id}/ultima-janela'));
  } else if (escolha === 1) {
    const ponto = dados.pontos[exec.vu.idInTest % dados.pontos.length];
    resposta = http.get(`${BASE_URL}/api/v1/pontos/${ponto}/telemetria?simulado=true&size=50`,
      parametros('GET /pontos/{id}/telemetria'));
  } else {
    resposta = http.get(`${BASE_URL}/api/v1/maquinas/${dados.maquinaId}/ensaios?size=20`,
      parametros('GET /maquinas/{id}/ensaios'));
  }
  check(resposta, { 'consulta respondida (200)': (r) => r.status === 200 });
}

// Cada iteração de um usuário virtual: envia uma janela, faz uma consulta e espera.
export default function (dados) {
  enviarJanela(dados);
  consultar(dados);
  sleep(PAUSA_S);
}
