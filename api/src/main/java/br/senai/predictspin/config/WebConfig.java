package br.senai.predictspin.config;

import org.springframework.core.convert.converter.Converter;
import org.springframework.core.convert.converter.ConverterFactory;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import org.springframework.context.annotation.Configuration;

import br.senai.predictspin.comum.EnumComValor;

/** Permite usar o valor do enum na query string (ex.: ?condicao=ferramenta_desgastada). */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverterFactory(new TextoParaEnumComValor());
    }

    static class TextoParaEnumComValor implements ConverterFactory<String, EnumComValor> {

        @Override
        @SuppressWarnings({"unchecked", "rawtypes"})
        public <T extends EnumComValor> Converter<String, T> getConverter(Class<T> tipo) {
            return texto -> texto == null || texto.isBlank() ? null : (T) EnumComValor.de((Class) tipo, texto);
        }
    }
}
