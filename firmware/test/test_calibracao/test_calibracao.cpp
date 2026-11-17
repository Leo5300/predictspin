// Testes nativos da calibração: conta de ganho e offset, recusas, comandos da serial, arquivo e o
// efeito do ganho calibrado sobre o RMS.
#include <math.h>
#include <string.h>
#include <unity.h>

#include "Calibracao.h"
#include "Caracteristicas.h"

using namespace ps;

void setUp() {}
void tearDown() {}

static const double PI = 3.141592653589793;

// Leituras paradas de uma posição: valor médio com um ruído pequeno e determinístico (±amplitude)
static MediaDesvio posicao(double media, double amplitude, uint32_t n = 3200) {
  MediaDesvio m;
  m.zerar();
  for (uint32_t i = 0; i < n; i++) m.amostra(media + ((i % 2) ? amplitude : -amplitude));
  return m;
}

// ---------------------------------------------------------------- conta

void test_ganho_e_offset_da_bancada() {
  // medido em 10/11: 273,5 LSB/g e offset Z de +1286 LSB -> cima = 1559,5 e baixo = 1012,5
  double ganho = 0, offset = 0;
  TEST_ASSERT_TRUE(calcularCalibracao(1559.5, 1012.5, &ganho, &offset) == ResultadoCal::OK);
  TEST_ASSERT_FLOAT_WITHIN(1e-9, 273.5, ganho);
  TEST_ASSERT_FLOAT_WITHIN(1e-9, 1286.0, offset);
}

void test_ganho_nominal_e_offset_zero() {
  double ganho = 0, offset = 0;
  TEST_ASSERT_TRUE(calcularCalibracao(256.0, -256.0, &ganho, &offset) == ResultadoCal::OK);
  TEST_ASSERT_FLOAT_WITHIN(1e-9, 256.0, ganho);
  TEST_ASSERT_FLOAT_WITHIN(1e-9, 0.0, offset);
}

void test_recusa_ganho_implausivel() {
  double ganho = -1, offset = -1;
  // 150 LSB/g: abaixo de 200
  TEST_ASSERT_TRUE(calcularCalibracao(1436.0, 1136.0, &ganho, &offset) == ResultadoCal::GANHO_IMPLAUSIVEL);
  // 350 LSB/g: acima de 320
  TEST_ASSERT_TRUE(calcularCalibracao(1636.0, 936.0, &ganho, &offset) == ResultadoCal::GANHO_IMPLAUSIVEL);
  // cima e baixo trocados: ganho negativo
  TEST_ASSERT_TRUE(calcularCalibracao(1012.5, 1559.5, &ganho, &offset) == ResultadoCal::GANHO_IMPLAUSIVEL);
  // nada foi escrito
  TEST_ASSERT_EQUAL_FLOAT(-1.0, ganho);
  TEST_ASSERT_EQUAL_FLOAT(-1.0, offset);
  // os limites valem
  TEST_ASSERT_TRUE(calcularCalibracao(200.0, -200.0, &ganho, &offset) == ResultadoCal::OK);
  TEST_ASSERT_TRUE(calcularCalibracao(320.0, -320.0, &ganho, &offset) == ResultadoCal::OK);
}

// ---------------------------------------------------------------- checagem de uma posição

void test_media_e_desvio_em_fluxo() {
  MediaDesvio m = posicao(1559.5, 3.0);
  TEST_ASSERT_EQUAL_UINT32(3200, m.n());
  TEST_ASSERT_FLOAT_WITHIN(1e-9, 1559.5, m.media());
  TEST_ASSERT_FLOAT_WITHIN(1e-9, 3.0, m.desvio());
}

void test_posicao_parada_e_aceita() {
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(1559.5, 4.0)) == ResultadoCal::OK);
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(-256.0, 4.0)) == ResultadoCal::OK);
}

void test_recusa_desvio_alto() {
  // ±60 LSB: o sensor estava mexendo
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(1559.5, 60.0)) == ResultadoCal::DESVIO_ALTO);
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(1559.5, CAL_DESVIO_MAX_LSB)) == ResultadoCal::OK);
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(1559.5, CAL_DESVIO_MAX_LSB + 0.5)) == ResultadoCal::DESVIO_ALTO);
}

void test_recusa_leitura_fora_da_faixa_e_poucas_amostras() {
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(3000.0, 2.0)) == ResultadoCal::FORA_DA_FAIXA);
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(-3000.0, 2.0)) == ResultadoCal::FORA_DA_FAIXA);
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(256.0, 2.0, 100)) == ResultadoCal::POUCAS_AMOSTRAS);
  TEST_ASSERT_TRUE(avaliarLeitura(posicao(256.0, 2.0, CAL_AMOSTRAS_MIN)) == ResultadoCal::OK);
}

void test_toda_recusa_tem_explicacao() {
  ResultadoCal todos[] = {ResultadoCal::OK, ResultadoCal::POUCAS_AMOSTRAS, ResultadoCal::DESVIO_ALTO,
                          ResultadoCal::FORA_DA_FAIXA, ResultadoCal::FALTA_CIMA, ResultadoCal::FALTA_BAIXO,
                          ResultadoCal::GANHO_IMPLAUSIVEL};
  for (ResultadoCal r : todos) {
    TEST_ASSERT_NOT_NULL(explicar(r));
    TEST_ASSERT_GREATER_THAN(1, (int)strlen(explicar(r)));
  }
}

// ---------------------------------------------------------------- comandos

void test_le_os_comandos_de_calibracao() {
  ComandoCal c = lerComandoCal("cal A cima");
  TEST_ASSERT_TRUE(c.valido);
  TEST_ASSERT_EQUAL_INT(0, c.ponto);
  TEST_ASSERT_TRUE(c.acao == AcaoCal::CIMA);

  c = lerComandoCal("cal b baixo");
  TEST_ASSERT_TRUE(c.valido);
  TEST_ASSERT_EQUAL_INT(1, c.ponto);
  TEST_ASSERT_TRUE(c.acao == AcaoCal::BAIXO);

  c = lerComandoCal("  cal   C   fim ");
  TEST_ASSERT_TRUE(c.valido);
  TEST_ASSERT_EQUAL_INT(2, c.ponto);
  TEST_ASSERT_TRUE(c.acao == AcaoCal::FIM);

  TEST_ASSERT_TRUE(lerComandoCal("cal A mostrar").acao == AcaoCal::MOSTRAR);
  TEST_ASSERT_TRUE(lerComandoCal("CAL A LIMPAR").acao == AcaoCal::LIMPAR);
}

void test_recusa_comandos_malformados() {
  TEST_ASSERT_FALSE(lerComandoCal("cal D cima").valido);
  TEST_ASSERT_FALSE(lerComandoCal("cal A").valido);
  TEST_ASSERT_FALSE(lerComandoCal("cal").valido);
  TEST_ASSERT_FALSE(lerComandoCal("calA cima").valido);
  TEST_ASSERT_FALSE(lerComandoCal("cal AB cima").valido);
  TEST_ASSERT_FALSE(lerComandoCal("cal A cima agora").valido);
  TEST_ASSERT_FALSE(lerComandoCal("cal A lado").valido);
  TEST_ASSERT_FALSE(lerComandoCal("estado").valido);
  TEST_ASSERT_FALSE(lerComandoCal("").valido);
  TEST_ASSERT_FALSE(lerComandoCal(nullptr).valido);
}

// ---------------------------------------------------------------- identificador e arquivo

void test_identificador_da_calibracao() {
  char buf[32];
  TEST_ASSERT_GREATER_THAN(0, (int)formatarIdCalibracao(0, 0, buf, sizeof(buf)));
  TEST_ASSERT_EQUAL_STRING("nominal", buf);
  // 2026-11-17T14:32:00Z
  formatarIdCalibracao(1, 1794925920u, buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("B-20261117T143200Z", buf);
  formatarIdCalibracao(2, 3, buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("C-semhora-3", buf);
  TEST_ASSERT_EQUAL_size_t(0, formatarIdCalibracao(1, 1794925920u, buf, 5));  // não coube
}

void test_arquivo_ida_e_volta() {
  CalibracaoPonto cal[3] = {{true, 273.5f, 1286.0f, 1794925920u}, {false, 0, 0, 0}, {true, 251.25f, -12.5f, 4}};
  char texto[200];
  TEST_ASSERT_GREATER_THAN(0, (int)formatarArquivoCal(cal, 5, texto, sizeof(texto)));
  TEST_ASSERT_EQUAL_STRING("pscal 1\nA 273.500 1286.0 1794925920\nB -\nC 251.250 -12.5 4\nserie 5\n", texto);

  CalibracaoPonto lida[3];
  uint32_t serie = 0;
  TEST_ASSERT_TRUE(lerArquivoCal(texto, lida, &serie));
  TEST_ASSERT_EQUAL_UINT32(5, serie);
  TEST_ASSERT_TRUE(lida[0].calibrado);
  TEST_ASSERT_FLOAT_WITHIN(1e-3, 273.5f, lida[0].ganhoLsbPorG);
  TEST_ASSERT_FLOAT_WITHIN(1e-3, 1286.0f, lida[0].offsetLsb);
  TEST_ASSERT_EQUAL_UINT32(1794925920u, lida[0].carimbo);
  TEST_ASSERT_FALSE(lida[1].calibrado);
  TEST_ASSERT_TRUE(lida[2].calibrado);
  TEST_ASSERT_EQUAL_UINT32(4, lida[2].carimbo);
}

void test_arquivo_ruim_fica_nominal() {
  CalibracaoPonto lida[3];
  uint32_t serie = 0;
  TEST_ASSERT_FALSE(lerArquivoCal("lixo\nA 273.5 0 1\n", lida, &serie));
  TEST_ASSERT_FALSE(lida[0].calibrado);
  TEST_ASSERT_EQUAL_UINT32(1, serie);
  TEST_ASSERT_FALSE(lerArquivoCal(nullptr, lida, &serie));
  // ganho fora da faixa e linha cortada: ignorados
  TEST_ASSERT_TRUE(lerArquivoCal("pscal 1\nA 999.0 0.0 1794925920\nB 260.0\nC 260.0 1.0 7", lida, &serie));
  TEST_ASSERT_FALSE(lida[0].calibrado);
  TEST_ASSERT_FALSE(lida[1].calibrado);
  TEST_ASSERT_TRUE(lida[2].calibrado);  // última linha sem \n vale
  TEST_ASSERT_EQUAL_UINT32(1, serie);
}

// ---------------------------------------------------------------- efeito no RMS

// Senoide de 1 g de amplitude num sensor de 273,5 LSB/g, sobre o offset da bancada
static ResultadoPonto senoideDeUmG(double escalaGporLsb) {
  const double taxa = 1600.0, ganho = 273.5;
  const uint32_t n = 8000;
  AcumuladorPonto a;
  a.iniciar(1286.0, taxa, n, 0.0);
  for (uint32_t i = 0; i < n; i++) {
    double x = 1286.0 + ganho * sin(2 * PI * 80.0 * i / taxa + 0.2);
    a.amostra((int16_t)lround(x));
  }
  return a.concluir(escalaGporLsb);
}

void test_rms_com_ganho_calibrado_e_com_o_nominal() {
  CalibracaoPonto cal = {true, 273.5f, 1286.0f, 1794925920u};
  float calibrado = senoideDeUmG(escalaG(cal, 0.0039f)).rmsG;
  // 1 g de amplitude: RMS = 1/raiz(2)
  TEST_ASSERT_FLOAT_WITHIN(0.002f, (float)(1.0 / sqrt(2.0)), calibrado);

  CalibracaoPonto semCal = {false, 0, 0, 0};
  float nominal = senoideDeUmG(escalaG(semCal, 0.0039f)).rmsG;
  // 273,5 x 3,9 mg = 1,0667: o nominal sai cerca de 7% acima
  float diferenca = nominal / calibrado - 1.0f;
  TEST_ASSERT_FLOAT_WITHIN(0.002f, 0.0667f, diferenca);
}

void test_escala_sem_calibracao_ou_com_ganho_invalido_e_a_nominal() {
  CalibracaoPonto semCal = {false, 273.5f, 0, 0};
  TEST_ASSERT_EQUAL_FLOAT(0.0039f, escalaG(semCal, 0.0039f));
  CalibracaoPonto invalida = {true, 50.0f, 0, 1};
  TEST_ASSERT_EQUAL_FLOAT(0.0039f, escalaG(invalida, 0.0039f));
  CalibracaoPonto boa = {true, 250.0f, 0, 1};
  TEST_ASSERT_EQUAL_FLOAT(0.004f, escalaG(boa, 0.0039f));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_ganho_e_offset_da_bancada);
  RUN_TEST(test_ganho_nominal_e_offset_zero);
  RUN_TEST(test_recusa_ganho_implausivel);
  RUN_TEST(test_media_e_desvio_em_fluxo);
  RUN_TEST(test_posicao_parada_e_aceita);
  RUN_TEST(test_recusa_desvio_alto);
  RUN_TEST(test_recusa_leitura_fora_da_faixa_e_poucas_amostras);
  RUN_TEST(test_toda_recusa_tem_explicacao);
  RUN_TEST(test_le_os_comandos_de_calibracao);
  RUN_TEST(test_recusa_comandos_malformados);
  RUN_TEST(test_identificador_da_calibracao);
  RUN_TEST(test_arquivo_ida_e_volta);
  RUN_TEST(test_arquivo_ruim_fica_nominal);
  RUN_TEST(test_rms_com_ganho_calibrado_e_com_o_nominal);
  RUN_TEST(test_escala_sem_calibracao_ou_com_ganho_invalido_e_a_nominal);
  return UNITY_END();
}
