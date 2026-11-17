// Calibração de ganho e offset de cada ADXL345 no eixo de análise do ponto, pelo método das duas
// posições: o eixo virado para cima (+1 g) e para baixo (-1 g), com o sensor parado. Lógica pura:
// conta, checagens, leitura dos comandos da serial e formato do arquivo. A medida em si (2 s de
// amostras) e a gravação no LittleFS ficam em src/Calibrador.cpp.
//
//   ganho  = (cima - baixo) / 2   em LSB por g
//   offset = (cima + baixo) / 2   em LSB (leitura com 0 g)
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace ps {

// Faixa aceita para o ganho. O datasheet dá 230 a 282 LSB/g (±16 g, resolução total); a faixa é mais
// larga para não recusar um sensor bom fora do típico, e estreita o bastante para pegar erro de
// posição (por exemplo "cima" e "baixo" trocados, ou o sensor de lado).
static const double CAL_GANHO_MIN = 200.0;
static const double CAL_GANHO_MAX = 320.0;
// Desvio-padrão máximo das leituras de uma posição: acima disso o sensor estava mexendo. O ruído do
// ADXL345 a 1600 Hz fica em poucos LSB; 20 LSB (cerca de 75 mg) já é movimento ou batida.
static const double CAL_DESVIO_MAX_LSB = 20.0;
// Média máxima, em módulo, de uma posição parada: 2048 LSB é 8 g no ganho nominal, metade do fundo
// de escala. Acima disso não é 1 g parado (sensor em choque, saturado ou leitura errada).
static const double CAL_LEITURA_MAX_LSB = 2048.0;
// Duração da média de cada posição e mínimo de amostras aceito (90% de 2 s a 1600 Hz).
static const uint32_t CAL_DURACAO_MS = 2000;
static const uint32_t CAL_AMOSTRAS_MIN = 2880;
// Carimbo a partir do qual é instante (segundos desde 1970, UTC): 2026-01-01. Abaixo é número de série.
static const uint32_t CAL_CARIMBO_COM_HORA = 1767225600u;

// Média e desvio-padrão em fluxo (algoritmo de Welford): não guarda as amostras.
class MediaDesvio {
 public:
  void zerar();
  void amostra(double valor);
  uint32_t n() const { return n_; }
  double media() const { return media_; }
  // desvio-padrão da população (divide por n)
  double desvio() const;

 private:
  uint32_t n_ = 0;
  double media_ = 0.0;
  double m2_ = 0.0;
};

enum class ResultadoCal : uint8_t {
  OK,
  POUCAS_AMOSTRAS,    // a medida não juntou CAL_AMOSTRAS_MIN
  DESVIO_ALTO,        // sensor mexendo
  FORA_DA_FAIXA,      // |média| acima de CAL_LEITURA_MAX_LSB
  FALTA_CIMA,         // "fim" sem a posição de cima
  FALTA_BAIXO,        // "fim" sem a posição de baixo
  GANHO_IMPLAUSIVEL,  // ganho fora de CAL_GANHO_MIN a CAL_GANHO_MAX
};

// Explicação curta para a serial
const char* explicar(ResultadoCal r);

// Confere uma posição medida (média e desvio do eixo de análise, em LSB).
ResultadoCal avaliarLeitura(const MediaDesvio& m);

// Ganho e offset a partir das médias de cima e de baixo. Só escreve ganho e offset quando dá OK.
ResultadoCal calcularCalibracao(double cima, double baixo, double* ganho, double* offset);

// Calibração guardada de um ponto. carimbo: 0 = sem calibração (nominal); a partir de
// CAL_CARIMBO_COM_HORA, instante da calibração em segundos UTC; abaixo, número de série de uma
// calibração feita sem hora sincronizada.
struct CalibracaoPonto {
  bool calibrado;
  float ganhoLsbPorG;
  float offsetLsb;
  uint32_t carimbo;
};

// g por LSB: 1/ganho calibrado, ou a escala nominal sem calibração
float escalaG(const CalibracaoPonto& c, float nominal);

// Identificador curto (até 24 caracteres): "nominal", "A-20261117T143200Z" ou "A-semhora-3".
// Devolve o tamanho escrito, ou 0 se não coube.
size_t formatarIdCalibracao(int ponto, uint32_t carimbo, char* buf, size_t tamanho);

// ---------------------------------------------------------------- comandos da serial

enum class AcaoCal : uint8_t { CIMA, BAIXO, FIM, MOSTRAR, LIMPAR };

struct ComandoCal {
  bool valido;
  int ponto;  // 0 = A, 1 = B, 2 = C
  AcaoCal acao;
};

// "cal A cima", "cal b baixo", "cal C fim", "cal A mostrar", "cal A limpar". Espaços extras entre as
// palavras são aceitos; o ponto aceita maiúscula ou minúscula.
ComandoCal lerComandoCal(const char* texto);

// ---------------------------------------------------------------- arquivo (/cal.txt no LittleFS)

// Texto de uma linha por ponto:
//   pscal 1
//   A 273.500 1286.0 1794398400
//   B -
//   C -
//   serie 1
// "serie" é o próximo número de série para calibração sem hora.
size_t formatarArquivoCal(const CalibracaoPonto cal[3], uint32_t proximaSerie, char* buf, size_t tamanho);

// Lê o arquivo. Ponto com linha ausente, malformada ou com ganho fora da faixa fica sem calibração.
// Devolve false se o cabeçalho não é "pscal 1" (aí tudo fica sem calibração e a série volta a 1).
bool lerArquivoCal(const char* texto, CalibracaoPonto cal[3], uint32_t* proximaSerie);

}  // namespace ps
