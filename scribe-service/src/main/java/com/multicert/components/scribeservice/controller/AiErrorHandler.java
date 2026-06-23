package com.multicert.components.scribeservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.retry.NonTransientAiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class AiErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(AiErrorHandler.class);

    @ExceptionHandler(NonTransientAiException.class)
    public ResponseEntity<String> handleAiError(NonTransientAiException ex) {
        String message = ex.getMessage() != null ? ex.getMessage() : "";

        if (message.contains("401") || message.contains("invalid_api_key")) {
            log.error("handleAiError | Falha de autenticação com provedor de IA — chave inválida ou ausente: [{}]", message);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(
                    "Chave de API da OpenAI inválida ou não configurada. "
                            + "Defina a variável de ambiente SPRING_AI_OPENAI_API_KEY com uma chave válida "
                            + "(gerada em https://platform.openai.com/api-keys, requer conta com billing ativo)."
            );
        }

        log.error("handleAiError | Falha ao comunicar com o provedor de IA: [{}]", message);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(
                "Falha ao comunicar com o provedor de IA. Tente novamente em alguns instantes."
        );
    }
}
