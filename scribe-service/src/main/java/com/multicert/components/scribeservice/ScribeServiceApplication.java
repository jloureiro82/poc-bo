package com.multicert.components.scribeservice;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@SpringBootApplication
public class ScribeServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(ScribeServiceApplication.class, args);
    }

    @Component
    static class AiModelConfigCheck {

        private static final Logger log = LoggerFactory.getLogger(AiModelConfigCheck.class);

        @Value("${spring.ai.model.chat}")
        private String activeChatModel;

        @Value("${spring.ai.openai.api-key}")
        private String openAiApiKey;

        @EventListener(ApplicationReadyEvent.class)
        void checkConfig() {
            log.info("checkConfig | Aplicação iniciada com provedor de IA configurado como [{}]", activeChatModel);

            if ("openai".equals(activeChatModel) && "changeme".equals(openAiApiKey)) {
                log.warn("checkConfig | SPRING_AI_OPENAI_API_KEY não definida — chamadas a /atas vão falhar com 401. "
                        + "Configure a variável de ambiente com uma chave válida de [https://platform.openai.com/api-keys]");
            }

            if ("ollama".equals(activeChatModel)) {
                log.info("checkConfig | Modo local ativo — requisições serão enviadas ao Ollama em [{}]", "http://localhost:11434");
            }
        }
    }
}
