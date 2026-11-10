package br.senai.predictspin.seguranca;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import org.springframework.stereotype.Component;

/**
 * Hash da chave de dispositivo: SHA-256 de (sal + chave), em hexadecimal.
 * <p>
 * A chave é aleatória e longa (gerada com openssl rand), então um hash rápido basta e mantém a
 * ingestão barata; BCrypt custaria dezenas de milissegundos a cada envio. O sal vem de
 * DEVICE_CREDENTIAL_SALT e não deve mudar depois que os dispositivos forem criados.
 */
@Component
public class HashChaveDispositivo {

    private final String sal;

    public HashChaveDispositivo(PropriedadesSeguranca propriedades) {
        this.sal = propriedades.dispositivoSal() == null ? "" : propriedades.dispositivoSal();
    }

    public String calcular(String chave) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] hash = sha.digest((sal + chave).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponível na JVM", e);
        }
    }

    /** Comparação em tempo constante, para não vazar por tempo de resposta quantos caracteres batem. */
    public boolean confere(String chave, String hashArmazenado) {
        if (chave == null || hashArmazenado == null) {
            return false;
        }
        byte[] calculado = calcular(chave).getBytes(StandardCharsets.US_ASCII);
        byte[] armazenado = hashArmazenado.getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(calculado, armazenado);
    }
}
