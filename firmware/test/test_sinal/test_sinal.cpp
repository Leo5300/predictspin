// Testes nativos das características (pio test -e native). Sinais sintéticos com resposta conhecida.
#include <math.h>
#include <stdlib.h>
#include <unity.h>

#include "Caracteristicas.h"
#include "Velocidade.h"

using namespace ps;

static const double TAXA = 1600.0;
static const double ESCALA = 0.0039;  // g por LSB
static const double PI = 3.141592653589793;

void setUp() {}
void tearDown() {}

// Senoide de amplitude amp (LSB) a f Hz sobre um DC, alimentada amostra a amostra
static ResultadoPonto rodar(double dcLsb, double amp, double f, double rotacaoHz, uint32_t n,
                            double deslocamento, double fase = 0.3) {
  AcumuladorPonto a;
  a.iniciar(deslocamento, TAXA, n, rotacaoHz);
  for (uint32_t i = 0; i < n; i++) {
    double x = dcLsb + amp * sin(2 * PI * f * i / TAXA + fase);
    a.amostra((int16_t)lround(x));
  }
  return a.concluir(ESCALA);
}

void test_goertzel_acha_as_tres_ordens() {
  // rotação de 13,5 Hz (810 rpm): 1X = 13,5, 2X = 27, 3X = 40,5 Hz, cada uma com amplitude própria
  const double rot = 13.5;
  const uint32_t n = 8000;
  AcumuladorPonto a;
  a.iniciar(256.0, TAXA, n, rot);
  for (uint32_t i = 0; i < n; i++) {
    double t = i / TAXA;
    double x = 256.0 + 100.0 * sin(2 * PI * rot * t) + 40.0 * sin(2 * PI * 2 * rot * t + 1.0) +
               15.0 * sin(2 * PI * 3 * rot * t + 2.0);
    a.amostra((int16_t)lround(x));
  }
  ResultadoPonto r = a.concluir(ESCALA);
  TEST_ASSERT_FLOAT_WITHIN(0.01 * 100 * ESCALA, 100 * ESCALA, r.o1x);
  TEST_ASSERT_FLOAT_WITHIN(0.02 * 40 * ESCALA, 40 * ESCALA, r.o2x);
  TEST_ASSERT_FLOAT_WITHIN(0.05 * 15 * ESCALA, 15 * ESCALA, r.o3x);
}

void test_goertzel_fora_do_bin_inteiro_e_dc_grande_nao_atrapalham() {
  // 1 g de gravidade (256 LSB) e frequência que não cai em bin inteiro da janela
  ResultadoPonto r = rodar(256.0, 50.0, 11.37, 11.37, 8000, 0.0);
  TEST_ASSERT_FLOAT_WITHIN(0.02 * 50 * ESCALA, 50 * ESCALA, r.o1x);
  // 2X e 3X sem sinal: ficam perto de zero apesar do DC (vazamento barrado pela janela de Hann)
  TEST_ASSERT_LESS_THAN_FLOAT(0.01 * 50 * ESCALA, r.o2x);
  TEST_ASSERT_LESS_THAN_FLOAT(0.01 * 50 * ESCALA, r.o3x);
}

void test_sem_rotacao_as_ordens_sao_zero() {
  ResultadoPonto r = rodar(256.0, 50.0, 20.0, 0.0, 8000, 256.0);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.o1x);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.o2x);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.o3x);
}

void test_rms_e_pico_de_senoide_sem_o_dc() {
  ResultadoPonto r = rodar(256.0, 100.0, 50.0, 0.0, 8000, 0.0);
  TEST_ASSERT_FLOAT_WITHIN(0.005 * 70.71 * ESCALA, 100.0 / sqrt(2.0) * ESCALA, r.rmsG);
  TEST_ASSERT_FLOAT_WITHIN(1.0 * ESCALA, 100.0 * ESCALA, r.picoG);
  TEST_ASSERT_EQUAL_UINT32(8000, r.amostras);
}

void test_curtose_de_senoide_e_um_e_meio() {
  ResultadoPonto r = rodar(0.0, 1000.0, 37.0, 0.0, 8000, 0.0);
  TEST_ASSERT_FLOAT_WITHIN(0.01, 1.5, r.curtose);
}

void test_curtose_de_ruido_gaussiano_e_tres() {
  srand(42);
  AcumuladorPonto a;
  a.iniciar(0.0, TAXA, 40000, 0.0);
  const uint32_t n = 40000;
  static float bruto[40000];
  for (uint32_t i = 0; i < n; i++) {
    // Box-Muller
    double u1 = (rand() + 1.0) / (RAND_MAX + 2.0), u2 = (rand() + 1.0) / (RAND_MAX + 2.0);
    double g = sqrt(-2 * log(u1)) * cos(2 * PI * u2);
    int16_t v = (int16_t)lround(300.0 * g);
    bruto[i] = v;
    a.amostra(v);
  }
  ResultadoPonto r = a.concluir(ESCALA);
  TEST_ASSERT_FLOAT_WITHIN(0.1, 3.0, r.curtose);
  // o cálculo em fluxo bate com o cálculo direto
  TEST_ASSERT_FLOAT_WITHIN(1e-3, curtose(bruto, n), r.curtose);
}

void test_curtose_de_impactos_e_alta() {
  AcumuladorPonto a;
  a.iniciar(0.0, TAXA, 8000, 0.0);
  for (uint32_t i = 0; i < 8000; i++) {
    a.amostra(i % 400 == 0 ? 2000 : (int16_t)((i % 2) ? 10 : -10));
  }
  TEST_ASSERT_GREATER_THAN_FLOAT(10.0f, a.concluir(ESCALA).curtose);
}

void test_sinal_constante_tem_rms_zero_e_curtose_zero() {
  AcumuladorPonto a;
  a.iniciar(0.0, TAXA, 100, 0.0);
  for (int i = 0; i < 100; i++) a.amostra(256);
  ResultadoPonto r = a.concluir(ESCALA);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.rmsG);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.picoG);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.curtose);
  TEST_ASSERT_FLOAT_WITHIN(1e-9, 256.0, a.media());
}

void test_janela_vazia_nao_quebra() {
  AcumuladorPonto a;
  a.iniciar(10.0, TAXA, 8000, 13.0);
  ResultadoPonto r = a.concluir(ESCALA);
  TEST_ASSERT_EQUAL_UINT32(0, r.amostras);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, r.rmsG);
  TEST_ASSERT_FLOAT_WITHIN(1e-9, 10.0, a.media());
}

void test_saturacao_e_marcada() {
  AcumuladorPonto a;
  a.iniciar(0.0, TAXA, 10, 0.0);
  a.amostra(4095);
  a.marcarSaturacao();
  TEST_ASSERT_TRUE(a.concluir(ESCALA).saturou);
}

void test_ordens_validas_so_com_rotacao_estavel() {
  TEST_ASSERT_TRUE(ordensValidas(800.0f, 810.0f, 0.02f, 0.05f));
  TEST_ASSERT_FALSE(ordensValidas(0.0f, 810.0f, 0.0f, 0.05f));     // janela anterior parada
  TEST_ASSERT_FALSE(ordensValidas(800.0f, 0.0f, 0.0f, 0.05f));     // parou nesta janela
  TEST_ASSERT_FALSE(ordensValidas(800.0f, 900.0f, 0.01f, 0.05f));  // mudou de marcha
  TEST_ASSERT_FALSE(ordensValidas(800.0f, 805.0f, 0.08f, 0.05f));  // oscilou dentro da janela
}

// ---------------------------------------------------------------- velocidade

// 1 g = 256 LSB nestes testes (escala 1/256 g por LSB)
static const double LSB_POR_G = 256.0;

// Senoide de 1 g de pico a f Hz sobre a gravidade (+1 g de DC). A primeira janela de 5 s acomoda o
// filtro, como no firmware; o RMS é o da segunda.
static double velocidadeDeSenoide(double f, double picoG = 1.0) {
  Velocidade v;
  v.configurar(TAXA, 10.0);
  v.reiniciar();
  const uint32_t n = 8000;
  uint32_t i = 0;
  for (int janela = 0; janela < 2; janela++) {
    v.comecarJanela();
    for (uint32_t k = 0; k < n; k++, i++) {
      double x = LSB_POR_G + picoG * LSB_POR_G * sin(2 * PI * f * i / TAXA + 0.3);
      v.amostra((int16_t)lround(x));
    }
  }
  return v.rmsMmS(1.0 / LSB_POR_G);
}

// Modelo contínuo do filtro, s / (s + wc)^2 com wc = 10 Hz: velocidade RMS de uma senoide de 1 g de pico
static double velocidadeDoModelo(double f) {
  double w = 2 * PI * f, wc = 2 * PI * 10.0;
  return MM_S2_POR_G / (w * sqrt(2.0)) * (w * w / (w * w + wc * wc));
}

void test_velocidade_a_100_hz_e_a_conta_da_norma() {
  // a / (w raiz(2)) = 9806,65 / (2 pi 100 raiz(2)) = 11,04 mm/s
  TEST_ASSERT_FLOAT_WITHIN(0.01, 11.04, MM_S2_POR_G / (2 * PI * 100.0 * sqrt(2.0)));
  TEST_ASSERT_FLOAT_WITHIN(0.05 * 11.04, 11.04, velocidadeDeSenoide(100.0));
}

void test_velocidade_a_25_hz_segue_a_resposta_do_filtro() {
  // Ideal 44,15 mm/s; o filtro passa w^2 / (w^2 + wc^2) = 0,862 em 25 Hz: 38,06 mm/s. Tolerância de
  // 3%: a discretização (vazamento casado e pré-distorção) fica 2% acima do modelo contínuo.
  double esperado = velocidadeDoModelo(25.0);
  TEST_ASSERT_FLOAT_WITHIN(0.01, 38.06, esperado);
  TEST_ASSERT_FLOAT_WITHIN(0.03 * esperado, esperado, velocidadeDeSenoide(25.0));
}

void test_velocidade_a_400_hz_segue_a_resposta_do_filtro() {
  // Ideal 2,759 mm/s; o filtro passa 0,9994 em 400 Hz: 2,757 mm/s. Tolerância de 3%: a regra de
  // Al-Alaoui fica a menos de 1% do modelo em 400 Hz (a retangular erraria +13%).
  double esperado = velocidadeDoModelo(400.0);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 2.757, esperado);
  TEST_ASSERT_FLOAT_WITHIN(0.03 * esperado, esperado, velocidadeDeSenoide(400.0));
}

void test_velocidade_abaixo_da_banda_sai_atenuada() {
  // 5 Hz: o ideal seria 220,7 mm/s; o filtro passa só 20% (0,25 / 1,25)
  double ideal = MM_S2_POR_G / (2 * PI * 5.0 * sqrt(2.0));
  double medido = velocidadeDeSenoide(5.0);
  TEST_ASSERT_LESS_THAN_FLOAT(0.25 * ideal, medido);
  TEST_ASSERT_FLOAT_WITHIN(0.03 * velocidadeDoModelo(5.0), velocidadeDoModelo(5.0), medido);
}

void test_gravidade_constante_nao_vira_velocidade() {
  Velocidade v;
  v.configurar(TAXA, 10.0);
  v.reiniciar();
  v.comecarJanela();
  for (int i = 0; i < 16000; i++) v.amostra((int16_t)LSB_POR_G);  // 1 g parado
  TEST_ASSERT_EQUAL_FLOAT(0.0f, (float)v.rmsMmS(1.0 / LSB_POR_G));
  TEST_ASSERT_EQUAL_UINT32(16000, v.amostras());
}

void test_velocidade_escala_com_o_ganho_e_janela_vazia() {
  Velocidade v;
  v.configurar(TAXA, 10.0);
  v.reiniciar();
  v.comecarJanela();
  TEST_ASSERT_EQUAL_FLOAT(0.0f, (float)v.rmsMmS(1.0 / 273.5));  // sem amostras
  for (uint32_t i = 0; i < 16000; i++) v.amostra((int16_t)lround(256.0 * sin(2 * PI * 100.0 * i / TAXA)));
  // as mesmas amostras em LSB com o ganho calibrado de 273,5 em vez de 256: 6,4% menos velocidade
  double razao = v.rmsMmS(1.0 / 273.5) / v.rmsMmS(1.0 / 256.0);
  TEST_ASSERT_FLOAT_WITHIN(1e-6, 256.0 / 273.5, razao);
}

void test_janela_completa_para_a_velocidade() {
  TEST_ASSERT_TRUE(janelaCompleta(8000, 8000));
  TEST_ASSERT_TRUE(janelaCompleta(7840, 8000));   // 98%
  TEST_ASSERT_FALSE(janelaCompleta(7839, 8000));
  TEST_ASSERT_FALSE(janelaCompleta(0, 8000));
  TEST_ASSERT_FALSE(janelaCompleta(10, 0));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_goertzel_acha_as_tres_ordens);
  RUN_TEST(test_goertzel_fora_do_bin_inteiro_e_dc_grande_nao_atrapalham);
  RUN_TEST(test_sem_rotacao_as_ordens_sao_zero);
  RUN_TEST(test_rms_e_pico_de_senoide_sem_o_dc);
  RUN_TEST(test_curtose_de_senoide_e_um_e_meio);
  RUN_TEST(test_curtose_de_ruido_gaussiano_e_tres);
  RUN_TEST(test_curtose_de_impactos_e_alta);
  RUN_TEST(test_sinal_constante_tem_rms_zero_e_curtose_zero);
  RUN_TEST(test_janela_vazia_nao_quebra);
  RUN_TEST(test_saturacao_e_marcada);
  RUN_TEST(test_ordens_validas_so_com_rotacao_estavel);
  RUN_TEST(test_velocidade_a_100_hz_e_a_conta_da_norma);
  RUN_TEST(test_velocidade_a_25_hz_segue_a_resposta_do_filtro);
  RUN_TEST(test_velocidade_a_400_hz_segue_a_resposta_do_filtro);
  RUN_TEST(test_velocidade_abaixo_da_banda_sai_atenuada);
  RUN_TEST(test_gravidade_constante_nao_vira_velocidade);
  RUN_TEST(test_velocidade_escala_com_o_ganho_e_janela_vazia);
  RUN_TEST(test_janela_completa_para_a_velocidade);
  return UNITY_END();
}
