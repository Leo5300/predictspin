// Testes nativos do ritmo de envio: recuperação da fila depois de uma queda de rede, espera de erro
// e volta ao ritmo normal. A fila é a FilaJanelas de verdade, com armazenamento em memória.
#include <map>
#include <string.h>
#include <unity.h>
#include <vector>

#include "FilaJanelas.h"
#include "RitmoEnvio.h"

using namespace ps;

void setUp() {}
void tearDown() {}

static const uint32_t INTERVALO_MS = 250;
static const uint64_t IDADE_RECUPERACAO_US = 30ULL * 1000000ULL;
static const uint64_t BASE_US = 1794398400ULL * 1000000ULL;  // 2026-11-11T12:00:00Z
static const uint32_t RESPOSTA_MS = 40;                     // a API responde 201 em 40 ms

class ArmazenamentoMemoria : public ArmazenamentoLotes {
 public:
  std::map<uint32_t, std::vector<DadosJanela>> lotes;
  bool gravar(uint32_t seq, const DadosJanela* j, uint16_t n) override {
    lotes[seq] = std::vector<DadosJanela>(j, j + n);
    return true;
  }
  uint16_t ler(uint32_t seq, DadosJanela* destino, uint16_t max) override {
    auto it = lotes.find(seq);
    if (it == lotes.end()) return 0;
    uint16_t n = 0;
    for (const auto& j : it->second) {
      if (n == max) break;
      destino[n++] = j;
    }
    return n;
  }
  void apagar(uint32_t seq) override { lotes.erase(seq); }
  bool limites(uint32_t* primeiro, uint32_t* ultimo) override {
    if (lotes.empty()) return false;
    *primeiro = lotes.begin()->first;
    *ultimo = lotes.rbegin()->first;
    return true;
  }
};

static DadosJanela janelaEm(uint64_t inicioUs) {
  DadosJanela j;
  memset(&j, 0, sizeof(j));
  j.inicioUs = inicioUs;
  return j;
}

// Relógio do teste: millis() e o UTC andam juntos
struct Relogio {
  uint32_t ms = 0;
  uint64_t utcUs() const { return BASE_US + (uint64_t)ms * 1000ULL; }
};

// Manda a janela da frente com a resposta dada e registra no ritmo; devolve o início da janela enviada
static uint64_t enviar(FilaJanelas& f, RitmoEnvio& r, Relogio& t, Decisao resposta) {
  DadosJanela j;
  TEST_ASSERT_TRUE(f.frente(&j));
  TEST_ASSERT_TRUE(r.podeEnviar(t.ms));
  t.ms += RESPOSTA_MS;
  if (resposta == Decisao::SUCESSO) f.removerFrente();
  DadosJanela proxima;
  bool tem = f.frente(&proxima);
  r.registrar(resposta, t.ms, tem, tem ? t.utcUs() - proxima.inicioUs : 0);
  return j.inicioUs;
}

void test_recuperacao_de_360_janelas_respeita_o_intervalo_e_a_ordem() {
  ArmazenamentoMemoria m;
  FilaJanelas f(&m, 50);
  f.iniciar();
  // 30 min sem rede: 360 janelas de 5 s, a mais nova com 1 min de idade quando a rede volta
  for (int i = 0; i < 360; i++) f.colocar(janelaEm(BASE_US - 60000000ULL - (uint64_t)(359 - i) * 5000000ULL));
  RitmoEnvio r(INTERVALO_MS, IDADE_RECUPERACAO_US);
  Relogio t;
  uint64_t anterior = 0;
  uint32_t ultimaResposta = 0;
  int enviadas = 0;
  while (f.tamanho() > 0) {
    uint32_t espera = r.esperaMs(t.ms);
    if (enviadas > 0) {
      // entre uma resposta e o próximo envio, pelo menos o intervalo mínimo
      TEST_ASSERT_GREATER_OR_EQUAL_UINT32(INTERVALO_MS, (t.ms + espera) - ultimaResposta);
    }
    t.ms += espera;
    uint64_t inicio = enviar(f, r, t, Decisao::SUCESSO);
    TEST_ASSERT_TRUE(inicio > anterior);  // ordem cronológica
    anterior = inicio;
    ultimaResposta = t.ms;
    enviadas++;
  }
  TEST_ASSERT_EQUAL_INT(360, enviadas);
  // 360 x (40 ms de resposta + 250 ms de intervalo), menos o intervalo depois da última
  TEST_ASSERT_EQUAL_UINT32(360 * RESPOSTA_MS + 359 * INTERVALO_MS, t.ms);
  // fila vazia: volta ao ritmo normal, a próxima janela pode sair na hora
  TEST_ASSERT_FALSE(r.recuperando());
  TEST_ASSERT_TRUE(r.podeEnviar(t.ms));
}

void test_erro_durante_a_recuperacao_usa_a_espera_crescente() {
  ArmazenamentoMemoria m;
  FilaJanelas f(&m, 50);
  f.iniciar();
  for (int i = 0; i < 50; i++) f.colocar(janelaEm(BASE_US - 3600000000ULL + (uint64_t)i * 5000000ULL));
  RitmoEnvio r(INTERVALO_MS, IDADE_RECUPERACAO_US);
  Relogio t;
  for (int i = 0; i < 10; i++) {
    t.ms += r.esperaMs(t.ms);
    enviar(f, r, t, Decisao::SUCESSO);
  }
  TEST_ASSERT_TRUE(r.recuperando());
  // 503 três vezes seguidas: 1, 2 e 4 s, maiores que o intervalo, e a mesma janela continua na frente
  DadosJanela frente;
  f.frente(&frente);
  const uint32_t esperas[3] = {1000, 2000, 4000};
  for (int k = 0; k < 3; k++) {
    t.ms += r.esperaMs(t.ms);
    enviar(f, r, t, Decisao::REENVIAR);
    TEST_ASSERT_EQUAL_UINT32(k + 1, r.falhas());
    TEST_ASSERT_EQUAL_UINT32(esperas[k], r.esperaMs(t.ms));
    TEST_ASSERT_FALSE(r.podeEnviar(t.ms + esperas[k] - 1));
  }
  DadosJanela ainda;
  f.frente(&ainda);
  TEST_ASSERT_EQUAL_UINT64(frente.inicioUs, ainda.inicioUs);
  // volta a responder: a falha zera e o intervalo mínimo volta a valer
  t.ms += r.esperaMs(t.ms);
  enviar(f, r, t, Decisao::SUCESSO);
  TEST_ASSERT_EQUAL_UINT32(0, r.falhas());
  TEST_ASSERT_EQUAL_UINT32(INTERVALO_MS, r.esperaMs(t.ms));
}

void test_quando_as_antigas_acabam_as_novas_saem_no_ritmo_normal() {
  ArmazenamentoMemoria m;
  FilaJanelas f(&m, 50);
  f.iniciar();
  for (int i = 0; i < 5; i++) f.colocar(janelaEm(BASE_US - 600000000ULL + (uint64_t)i * 5000000ULL));  // 10 min
  for (int i = 0; i < 3; i++) f.colocar(janelaEm(BASE_US - 5000000ULL + (uint64_t)i * 1000ULL));      // 5 s
  RitmoEnvio r(INTERVALO_MS, IDADE_RECUPERACAO_US);
  Relogio t;
  for (int i = 0; i < 4; i++) {
    t.ms += r.esperaMs(t.ms);
    enviar(f, r, t, Decisao::SUCESSO);
    TEST_ASSERT_TRUE(r.recuperando());
  }
  t.ms += r.esperaMs(t.ms);
  enviar(f, r, t, Decisao::SUCESSO);  // a última antiga: na frente fica uma janela nova
  TEST_ASSERT_FALSE(r.recuperando());
  TEST_ASSERT_EQUAL_UINT32(0, r.esperaMs(t.ms));
}

void test_limite_de_idade_e_descarte_tambem_contam() {
  RitmoEnvio r(INTERVALO_MS, IDADE_RECUPERACAO_US);
  r.registrar(Decisao::SUCESSO, 1000, true, IDADE_RECUPERACAO_US);  // exatamente 30 s: ainda é ao vivo
  TEST_ASSERT_FALSE(r.recuperando());
  TEST_ASSERT_TRUE(r.podeEnviar(1000));
  r.registrar(Decisao::DESCARTAR, 2000, true, IDADE_RECUPERACAO_US + 1);  // 400: descarta e segue no ritmo
  TEST_ASSERT_TRUE(r.recuperando());
  TEST_ASSERT_FALSE(r.podeEnviar(2249));
  TEST_ASSERT_TRUE(r.podeEnviar(2250));
  r.registrar(Decisao::SUCESSO, 3000, false, 0);  // fila vazia
  TEST_ASSERT_FALSE(r.recuperando());
  TEST_ASSERT_TRUE(r.podeEnviar(3000));
  // perto do estouro do millis()
  r.registrar(Decisao::SUCESSO, 0xFFFFFFF0u, true, IDADE_RECUPERACAO_US * 2);  // a próxima cai depois do estouro
  TEST_ASSERT_FALSE(r.podeEnviar(0xFFFFFFFFu));
  TEST_ASSERT_FALSE(r.podeEnviar(0xE9u));
  TEST_ASSERT_TRUE(r.podeEnviar(0xEAu));  // 0xFFFFFFF0 + 250 = 0xEA depois de dar a volta
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_recuperacao_de_360_janelas_respeita_o_intervalo_e_a_ordem);
  RUN_TEST(test_erro_durante_a_recuperacao_usa_a_espera_crescente);
  RUN_TEST(test_quando_as_antigas_acabam_as_novas_saem_no_ritmo_normal);
  RUN_TEST(test_limite_de_idade_e_descarte_tambem_contam);
  return UNITY_END();
}
