// Testes nativos da rotação, do alerta local e da fila de janelas.
#include <map>
#include <string.h>
#include <unity.h>
#include <vector>

#include "AlertaLocal.h"
#include "FilaJanelas.h"
#include "Rotacao.h"

using namespace ps;

void setUp() {}
void tearDown() {}

// ---------------------------------------------------------------- rotação

static const uint32_t PERIODO_MIN = 15000;  // 4000 rpm
static const uint32_t SEM_PULSO = 2000000;

void test_rotacao_constante() {
  Rotacao r(PERIODO_MIN, SEM_PULSO);
  uint32_t t = 1000;
  for (int i = 0; i < 70; i++) {  // 800 rpm = 75 ms por volta
    r.borda(t);
    t += 75000;
  }
  Rotacao::Janela j = r.fecharJanela(t - 70000);
  TEST_ASSERT_FLOAT_WITHIN(0.01, 800.0, j.rpm);
  TEST_ASSERT_FLOAT_WITHIN(1e-6, 0.0, j.variacao);
  TEST_ASSERT_EQUAL_UINT32(70, j.bordas);
}

void test_rotacao_ignora_repique() {
  Rotacao r(PERIODO_MIN, SEM_PULSO);
  uint32_t t = 0;
  for (int i = 0; i < 20; i++) {
    TEST_ASSERT_TRUE(r.borda(t));
    TEST_ASSERT_FALSE(r.borda(t + 300));    // repique da faixa refletiva
    TEST_ASSERT_FALSE(r.borda(t + 1200));
    t += 60000;  // 1000 rpm
  }
  TEST_ASSERT_FLOAT_WITHIN(0.01, 1000.0, r.fecharJanela(t - 59000).rpm);
}

void test_rotacao_volta_a_zero_sem_pulso() {
  Rotacao r(PERIODO_MIN, SEM_PULSO);
  r.borda(0);
  r.borda(60000);
  TEST_ASSERT_FLOAT_WITHIN(0.01, 1000.0, r.rpmAtual(100000));
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.rpmAtual(60000 + SEM_PULSO + 1));
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.fecharJanela(60000 + SEM_PULSO + 1).rpm);
}

void test_rotacao_sem_borda_e_zero() {
  Rotacao r(PERIODO_MIN, SEM_PULSO);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.rpmAtual(123));
  Rotacao::Janela j = r.fecharJanela(5000000);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, j.rpm);
  TEST_ASSERT_EQUAL_UINT32(0, j.bordas);
}

void test_rotacao_lenta_usa_o_ultimo_periodo() {
  // 40 rpm = 1,5 s por volta: uma janela de 1 s pode não ter período completo
  Rotacao r(PERIODO_MIN, SEM_PULSO);
  r.borda(0);
  r.borda(1500000);
  r.fecharJanela(1600000);
  Rotacao::Janela j = r.fecharJanela(2600000);  // janela sem borda, último pulso há 1,1 s
  TEST_ASSERT_FLOAT_WITHIN(0.01, 40.0, j.rpm);
}

void test_rotacao_variacao_mostra_mudanca_de_marcha() {
  Rotacao r(PERIODO_MIN, SEM_PULSO);
  uint32_t t = 0;
  for (int i = 0; i < 10; i++) { r.borda(t); t += 75000; }  // 800 rpm
  for (int i = 0; i < 10; i++) { r.borda(t); t += 50000; }  // 1200 rpm
  Rotacao::Janela j = r.fecharJanela(t);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.3f, j.variacao);
}

void test_rotacao_atravessa_estouro_do_micros() {
  Rotacao r(PERIODO_MIN, SEM_PULSO);
  uint32_t t = 0xFFFFFFFFu - 100000u;
  for (int i = 0; i < 5; i++) { r.borda(t); t += 60000; }  // estoura no meio
  TEST_ASSERT_FLOAT_WITHIN(0.01, 1000.0, r.fecharJanela(t - 50000).rpm);
}

void test_parada_longa_nao_forma_periodo() {
  Rotacao r(PERIODO_MIN, SEM_PULSO);
  r.borda(0);
  r.borda(10000000);  // 10 s depois: não é período de 6 rpm, é recomeço
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.rpmAtual(10000001));
  r.borda(10060000);
  TEST_ASSERT_FLOAT_WITHIN(0.01, 1000.0, r.rpmAtual(10060001));
}

// ---------------------------------------------------------------- alerta local

void test_alerta_aprende_e_compara() {
  AlertaLocal a(16, 1.6f, 3);
  for (int i = 0; i < 15; i++) TEST_ASSERT_TRUE(a.atualizar(0.10f) == EstadoAlerta::APRENDENDO);
  TEST_ASSERT_TRUE(a.atualizar(0.10f) == EstadoAlerta::NORMAL);
  TEST_ASSERT_FLOAT_WITHIN(1e-6, 0.10f, a.referencia());
  TEST_ASSERT_TRUE(a.atualizar(0.15f) == EstadoAlerta::NORMAL);   // 1,5x
  TEST_ASSERT_TRUE(a.atualizar(0.17f) == EstadoAlerta::ATENCAO);  // 1,7x
  TEST_ASSERT_TRUE(a.atualizar(0.20f) == EstadoAlerta::ATENCAO);
  TEST_ASSERT_TRUE(a.atualizar(0.20f) == EstadoAlerta::ALARME);   // 3 seguidas
  TEST_ASSERT_TRUE(a.atualizar(0.10f) == EstadoAlerta::NORMAL);
}

void test_alerta_reaprende() {
  AlertaLocal a(2, 1.6f, 3);
  a.atualizar(0.1f);
  a.atualizar(0.1f);
  a.reaprender();
  TEST_ASSERT_TRUE(a.estado() == EstadoAlerta::APRENDENDO);
  TEST_ASSERT_EQUAL_UINT8(0, a.progresso());
  a.atualizar(0.3f);
  a.atualizar(0.3f);
  TEST_ASSERT_FLOAT_WITHIN(1e-6, 0.3f, a.referencia());
}

void test_alerta_com_referencia_zero_fica_normal() {
  AlertaLocal a(2, 1.6f, 1);
  a.atualizar(0.0f);
  a.atualizar(0.0f);
  TEST_ASSERT_TRUE(a.atualizar(5.0f) == EstadoAlerta::NORMAL);
}

// ---------------------------------------------------------------- fila

class ArmazenamentoMemoria : public ArmazenamentoLotes {
 public:
  std::map<uint32_t, std::vector<DadosJanela>> lotes;
  bool falharGravacao = false;

  bool gravar(uint32_t seq, const DadosJanela* j, uint16_t n) override {
    if (falharGravacao) return false;
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

static DadosJanela janela(uint64_t numero) {
  DadosJanela j;
  memset(&j, 0, sizeof(j));
  j.inicioUs = numero;
  return j;
}

// Esvazia a fila e confere que as janelas saem de primeiro a ultimo, sem pular
static void conferirOrdem(FilaJanelas& f, uint64_t primeiro, uint64_t ultimo) {
  DadosJanela j;
  for (uint64_t esperado = primeiro; esperado <= ultimo; esperado++) {
    TEST_ASSERT_TRUE(f.frente(&j));
    TEST_ASSERT_EQUAL_UINT64(esperado, j.inicioUs);
    f.removerFrente();
  }
  TEST_ASSERT_FALSE(f.frente(&j));
  TEST_ASSERT_EQUAL_UINT32(0, f.tamanho());
}

void test_fila_so_na_ram_mantem_a_ordem() {
  ArmazenamentoMemoria m;
  FilaJanelas f(&m, 10);
  f.iniciar();
  for (uint64_t i = 1; i <= 20; i++) f.colocar(janela(i));
  TEST_ASSERT_EQUAL_UINT32(20, f.tamanho());
  TEST_ASSERT_TRUE(m.lotes.empty());  // com rede normal, nada vai para o arquivo
  conferirOrdem(f, 1, 20);
}

void test_fila_sem_rede_despeja_em_lotes_e_mantem_a_ordem() {
  ArmazenamentoMemoria m;
  FilaJanelas f(&m, 50);
  f.iniciar();
  // 30 min sem rede a 1 janela a cada 5 s = 360 janelas
  for (uint64_t i = 1; i <= 360; i++) f.colocar(janela(i));
  TEST_ASSERT_EQUAL_UINT32(360, f.tamanho());
  TEST_ASSERT_EQUAL_UINT32(0, f.perdidas());
  TEST_ASSERT_GREATER_THAN(0, (int)m.lotes.size());
  conferirOrdem(f, 1, 360);
  TEST_ASSERT_TRUE(m.lotes.empty());
}

void test_fila_recebe_novas_enquanto_esvazia_os_lotes() {
  ArmazenamentoMemoria m;
  FilaJanelas f(&m, 50);
  f.iniciar();
  for (uint64_t i = 1; i <= 100; i++) f.colocar(janela(i));
  DadosJanela j;
  uint64_t proxima = 101, esperado = 1;
  // a rede volta: sai uma, entra outra
  for (int k = 0; k < 150; k++) {
    TEST_ASSERT_TRUE(f.frente(&j));
    TEST_ASSERT_EQUAL_UINT64(esperado++, j.inicioUs);
    f.removerFrente();
    f.colocar(janela(proxima++));
  }
  conferirOrdem(f, esperado, proxima - 1);
}

void test_fila_sobrevive_a_reinicio_pelos_lotes() {
  ArmazenamentoMemoria m;
  {
    FilaJanelas f(&m, 50);
    f.iniciar();
    for (uint64_t i = 1; i <= 100; i++) f.colocar(janela(i));
  }
  // reinício: o que estava só na RAM se perde; os lotes gravados voltam
  FilaJanelas f2(&m, 50);
  f2.iniciar();
  TEST_ASSERT_GREATER_THAN(0, (int)f2.lotes());
  DadosJanela j;
  TEST_ASSERT_TRUE(f2.frente(&j));
  TEST_ASSERT_EQUAL_UINT64(1, j.inicioUs);
}

void test_fila_cheia_descarta_o_lote_mais_antigo() {
  ArmazenamentoMemoria m;
  FilaJanelas f(&m, 2);  // 2 lotes de 32 + 64 na RAM = 128
  f.iniciar();
  TEST_ASSERT_EQUAL_UINT32(128, f.capacidade());
  for (uint64_t i = 1; i <= 160; i++) f.colocar(janela(i));
  TEST_ASSERT_EQUAL_UINT32(32, f.perdidas());
  conferirOrdem(f, 33, 160);
}

void test_fila_com_falha_de_gravacao_perde_so_o_mais_antigo() {
  ArmazenamentoMemoria m;
  m.falharGravacao = true;
  FilaJanelas f(&m, 10);
  f.iniciar();
  for (uint64_t i = 1; i <= 70; i++) f.colocar(janela(i));
  TEST_ASSERT_EQUAL_UINT32(6, f.perdidas());
  conferirOrdem(f, 7, 70);
}

void test_fila_sem_armazenamento_funciona_so_com_ram() {
  FilaJanelas f(nullptr, 1);
  f.iniciar();
  for (uint64_t i = 1; i <= 64; i++) f.colocar(janela(i));
  conferirOrdem(f, 1, 64);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_rotacao_constante);
  RUN_TEST(test_rotacao_ignora_repique);
  RUN_TEST(test_rotacao_volta_a_zero_sem_pulso);
  RUN_TEST(test_rotacao_sem_borda_e_zero);
  RUN_TEST(test_rotacao_lenta_usa_o_ultimo_periodo);
  RUN_TEST(test_rotacao_variacao_mostra_mudanca_de_marcha);
  RUN_TEST(test_rotacao_atravessa_estouro_do_micros);
  RUN_TEST(test_parada_longa_nao_forma_periodo);
  RUN_TEST(test_alerta_aprende_e_compara);
  RUN_TEST(test_alerta_reaprende);
  RUN_TEST(test_alerta_com_referencia_zero_fica_normal);
  RUN_TEST(test_fila_so_na_ram_mantem_a_ordem);
  RUN_TEST(test_fila_sem_rede_despeja_em_lotes_e_mantem_a_ordem);
  RUN_TEST(test_fila_recebe_novas_enquanto_esvazia_os_lotes);
  RUN_TEST(test_fila_sobrevive_a_reinicio_pelos_lotes);
  RUN_TEST(test_fila_cheia_descarta_o_lote_mais_antigo);
  RUN_TEST(test_fila_com_falha_de_gravacao_perde_so_o_mais_antigo);
  RUN_TEST(test_fila_sem_armazenamento_funciona_so_com_ram);
  return UNITY_END();
}
