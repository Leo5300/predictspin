package br.senai.predictspin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PredictspinApplication {

    public static void main(String[] args) {
        SpringApplication.run(PredictspinApplication.class, args);
    }
}
