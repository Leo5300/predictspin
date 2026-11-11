// Testes nativos do protocolo: hora, JSON, resposta da API, política de envio e quadro serial.
#include <math.h>
#include <string.h>
#include <unity.h>

#include "Protocolo.h"

using namespace ps;

void setUp() {}
void tearDown() {}

// 2026-11-11T12:00:00Z
static const uint64_t INSTANTE = 1794398400ULL * 1000000ULL;

void test_formata_iso_com_microssegundos() {
  char buf[32];
  TEST_ASSERT_EQUAL_INT(27, formatarIso(INSTANTE + 123456, buf, sizeof(buf)));
  TEST_ASSERT_EQUAL_STRING("2026-11-11T12:00:00.123456Z", buf);
  formatarIso(0, buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("1970-01-01T00:00:00.000000Z", buf);
  formatarIso(951782400ULL * 1000000ULL, buf, sizeof(buf));  // ano bissexto
  TEST_ASSERT_EQUAL_STRING("2000-02-29T00:00:00.000000Z", buf);
}

void test_le_iso_em_varios_formatos() {
  uint64_t t = 0;
  TEST_ASSERT_TRUE(lerIso("2026-11-11T12:00:00Z", &t));
  TEST_ASSERT_EQUAL_UINT64(INSTANTE, t);
  TEST_ASSERT_TRUE(lerIso("2026-11-11T12:00:00.5Z", &t));
  TEST_ASSERT_EQUAL_UINT64(INSTANTE + 500000, t);
  TEST_ASSERT_TRUE(lerIso("2026-11-11T12:00:00.123456789Z", &t));  // nanossegundos: guarda até µs
  TEST_ASSERT_EQUAL_UINT64(INSTANTE + 123456, t);
  TEST_ASSERT_TRUE(lerIso("2026-11-11T09:00:00-03:00", &t));
  TEST_ASSERT_EQUAL_UINT64(INSTANTE, t);
  TEST_ASSERT_TRUE(lerIso("2026-11-11T12:00:00+00:00", &t));
  TEST_ASSERT_EQUAL_UINT64(INSTANTE, t);
}

void test_recusa_iso_invalido() {
  uint64_t t;
  TEST_ASSERT_FALSE(lerIso("2026-11-11 12:00", &t));
  TEST_ASSERT_FALSE(lerIso("2026-13-01T00:00:00Z", &t));
  TEST_ASSERT_FALSE(lerIso("2026-11-11T12:00:00", &t));  // sem fuso
  TEST_ASSERT_FALSE(lerIso("2026-11-11T12:00:00.Z", &t));
  TEST_ASSERT_FALSE(lerIso("ontem", &t));
  TEST_ASSERT_FALSE(lerIso(nullptr, &t));
}

void test_ida_e_volta_iso() {
  char buf[32];
  uint64_t t;
  formatarIso(INSTANTE + 987654, buf, sizeof(buf));
  TEST_ASSERT_TRUE(lerIso(buf, &t));
  TEST_ASSERT_EQUAL_UINT64(INSTANTE + 987654, t);
}

static DadosJanela janelaSoComA() {
  DadosJanela j;
  memset(&j, 0, sizeof(j));
  j.versao = VERSAO_DADOS_JANELA;
  j.inicioUs = INSTANTE;
  j.rotacaoRpm = 812.44f;
  j.amostras = 7990;
  j.amostrasEsperadas = 8000;
  j.pontos[0] = {true, 0.031f, 0.112f, 3.2f, 0.012f, 0.004f, 0.002f};
  return j;
}

void test_json_so_com_o_ponto_a() {
  char buf[600];
  DadosJanela j = janelaSoComA();
  size_t n = montarJson(j, "ps-torno-01", buf, sizeof(buf));
  TEST_ASSERT_EQUAL_size_t(strlen(buf), n);
  TEST_ASSERT_EQUAL_STRING(
      "{\"dispositivo\":\"ps-torno-01\",\"medido_em\":\"2026-11-11T12:00:00.000000Z\",\"rotacao_rpm\":812.4,"
      "\"saturou\":false,\"modo\":\"normal\",\"amostras\":7990,\"amostras_esperadas\":8000,\"pontos\":{"
      "\"A\":{\"rms_g\":0.03100,\"pico_g\":0.11200,\"curtose\":3.2000,\"o1x\":0.01200,\"o2x\":0.00400,"
      "\"o3x\":0.00200}}}",
      buf);
}

void test_json_com_tres_pontos_modo_rapido_e_saturacao() {
  char buf[600];
  DadosJanela j = janelaSoComA();
  j.pontos[1] = {true, 0.5f, 1.5f, 3.0f, 0.1f, 0.05f, 0.01f};
  j.pontos[2] = {true, 0.2f, 0.6f, 2.9f, 0.05f, 0.02f, 0.0f};
  j.modoRapido = 1;
  j.saturou = 1;
  j.amostrasEsperadas = 1600;
  TEST_ASSERT_GREATER_THAN(0, (int)montarJson(j, "ps-torno-01", buf, sizeof(buf)));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"modo\":\"rapido\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"saturou\":true"));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"A\":{"));
  TEST_ASSERT_NOT_NULL(strstr(buf, ",\"B\":{\"rms_g\":0.50000"));
  TEST_ASSERT_NOT_NULL(strstr(buf, ",\"C\":{"));
  TEST_ASSERT_EQUAL_CHAR('}', buf[strlen(buf) - 1]);
}

void test_json_sem_espaco_devolve_zero() {
  char buf[40];
  DadosJanela j = janelaSoComA();
  TEST_ASSERT_EQUAL_size_t(0, montarJson(j, "ps-torno-01", buf, sizeof(buf)));
}

void test_json_troca_nan_por_zero() {
  char buf[600];
  DadosJanela j = janelaSoComA();
  j.pontos[0].curtose = NAN;
  montarJson(j, "ps-torno-01", buf, sizeof(buf));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"curtose\":0.0000"));
  TEST_ASSERT_NULL(strstr(buf, "nan"));
}

void test_le_modo_rapido_ate_da_resposta() {
  uint64_t t = 0;
  TEST_ASSERT_TRUE(lerModoRapidoAte(
      "{\"janela_id\":42,\"duplicada\":false,\"ensaio_id\":null,\"medido_em\":\"2026-11-11T11:59:00Z\","
      "\"modo_rapido_ate\":\"2026-11-11T12:02:00.123456Z\"}",
      &t));
  TEST_ASSERT_EQUAL_UINT64(INSTANTE + 120000000ULL + 123456, t);
  TEST_ASSERT_TRUE(lerModoRapidoAte("{\"modo_rapido_ate\" : \"2026-11-11T12:00:00Z\"}", &t));
  TEST_ASSERT_EQUAL_UINT64(INSTANTE, t);
}

void test_sem_modo_rapido_ate_ou_invalido() {
  uint64_t t = 7;
  TEST_ASSERT_FALSE(lerModoRapidoAte("{\"janela_id\":42,\"duplicada\":false}", &t));
  TEST_ASSERT_FALSE(lerModoRapidoAte("{\"modo_rapido_ate\":null}", &t));
  TEST_ASSERT_FALSE(lerModoRapidoAte("{\"modo_rapido_ate\":\"amanha\"}", &t));
  TEST_ASSERT_FALSE(lerModoRapidoAte("", &t));
  TEST_ASSERT_FALSE(lerModoRapidoAte(nullptr, &t));
  TEST_ASSERT_EQUAL_UINT64(7, t);
}

void test_decisao_por_codigo_http() {
  TEST_ASSERT_TRUE(decidir(201) == Decisao::SUCESSO);
  TEST_ASSERT_TRUE(decidir(200) == Decisao::SUCESSO);
  TEST_ASSERT_TRUE(decidir(400) == Decisao::DESCARTAR);
  TEST_ASSERT_TRUE(decidir(403) == Decisao::DESCARTAR);
  TEST_ASSERT_TRUE(decidir(401) == Decisao::CHAVE_INVALIDA);
  TEST_ASSERT_TRUE(decidir(500) == Decisao::REENVIAR);
  TEST_ASSERT_TRUE(decidir(502) == Decisao::REENVIAR);
  TEST_ASSERT_TRUE(decidir(503) == Decisao::REENVIAR);
  TEST_ASSERT_TRUE(decidir(429) == Decisao::REENVIAR);
  TEST_ASSERT_TRUE(decidir(-1) == Decisao::REENVIAR);   // falha de conexão do HTTPClient
  TEST_ASSERT_TRUE(decidir(-11) == Decisao::REENVIAR);  // tempo esgotado
  TEST_ASSERT_TRUE(decidir(0) == Decisao::REENVIAR);
}

void test_espera_crescente_ate_60_s() {
  TEST_ASSERT_EQUAL_UINT32(0, esperaReenvioMs(0));
  TEST_ASSERT_EQUAL_UINT32(1000, esperaReenvioMs(1));
  TEST_ASSERT_EQUAL_UINT32(2000, esperaReenvioMs(2));
  TEST_ASSERT_EQUAL_UINT32(4000, esperaReenvioMs(3));
  TEST_ASSERT_EQUAL_UINT32(32000, esperaReenvioMs(6));
  TEST_ASSERT_EQUAL_UINT32(60000, esperaReenvioMs(7));
  TEST_ASSERT_EQUAL_UINT32(60000, esperaReenvioMs(1000));
}

void test_crc16_valor_de_referencia() {
  const char* texto = "123456789";
  TEST_ASSERT_EQUAL_HEX16(0x29B1, crc16((const uint8_t*)texto, 9));
}

void test_quadro_bruto_tem_cabecalho_amostras_e_crc() {
  int16_t a[6] = {1, -2, 256, 3, -4, 257};
  int16_t c[3] = {-4096, 4095, 0};
  const int16_t* amostras[3] = {a, nullptr, c};
  uint8_t n[3] = {2, 0, 1};
  uint8_t buf[QUADRO_MAX];
  size_t t = montarQuadro(7, 0x01020304, 1, n, amostras, buf, sizeof(buf));
  TEST_ASSERT_EQUAL_size_t(QUADRO_CABECALHO + 3 * 6 + 2, t);
  TEST_ASSERT_EQUAL_HEX8(0xA5, buf[0]);
  TEST_ASSERT_EQUAL_HEX8(0x5A, buf[1]);
  TEST_ASSERT_EQUAL_HEX8(0x01, buf[2]);
  TEST_ASSERT_EQUAL_UINT8(7, buf[3]);
  TEST_ASSERT_EQUAL_HEX8(0x04, buf[4]);  // t_us little-endian
  TEST_ASSERT_EQUAL_HEX8(0x01, buf[7]);
  TEST_ASSERT_EQUAL_UINT8(1, buf[8]);    // ir
  TEST_ASSERT_EQUAL_UINT8(2, buf[9]);
  TEST_ASSERT_EQUAL_UINT8(0, buf[10]);
  TEST_ASSERT_EQUAL_UINT8(1, buf[11]);
  TEST_ASSERT_EQUAL_HEX8(0xFE, buf[14]);  // -2 = 0xFFFE
  TEST_ASSERT_EQUAL_HEX8(0xFF, buf[15]);
  uint16_t crc = crc16(buf + 2, t - 4);
  TEST_ASSERT_EQUAL_HEX8(crc & 0xFF, buf[t - 2]);
  TEST_ASSERT_EQUAL_HEX8(crc >> 8, buf[t - 1]);
}

void test_quadro_recusa_contagem_alta_ou_buffer_pequeno() {
  int16_t a[3] = {0, 0, 0};
  const int16_t* amostras[3] = {a, a, a};
  uint8_t n[3] = {34, 0, 0};
  uint8_t buf[QUADRO_MAX];
  TEST_ASSERT_EQUAL_size_t(0, montarQuadro(0, 0, 0, n, amostras, buf, sizeof(buf)));
  uint8_t n1[3] = {1, 1, 1};
  TEST_ASSERT_EQUAL_size_t(0, montarQuadro(0, 0, 0, n1, amostras, buf, 10));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_formata_iso_com_microssegundos);
  RUN_TEST(test_le_iso_em_varios_formatos);
  RUN_TEST(test_recusa_iso_invalido);
  RUN_TEST(test_ida_e_volta_iso);
  RUN_TEST(test_json_so_com_o_ponto_a);
  RUN_TEST(test_json_com_tres_pontos_modo_rapido_e_saturacao);
  RUN_TEST(test_json_sem_espaco_devolve_zero);
  RUN_TEST(test_json_troca_nan_por_zero);
  RUN_TEST(test_le_modo_rapido_ate_da_resposta);
  RUN_TEST(test_sem_modo_rapido_ate_ou_invalido);
  RUN_TEST(test_decisao_por_codigo_http);
  RUN_TEST(test_espera_crescente_ate_60_s);
  RUN_TEST(test_crc16_valor_de_referencia);
  RUN_TEST(test_quadro_bruto_tem_cabecalho_amostras_e_crc);
  RUN_TEST(test_quadro_recusa_contagem_alta_ou_buffer_pequeno);
  return UNITY_END();
}
