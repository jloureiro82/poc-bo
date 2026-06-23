package com.multicert.components.scribeservice.service;

import com.multicert.components.scribeservice.model.AtaRequest;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
public class AtaSynthesisService {

    private static final Logger log = LoggerFactory.getLogger(AtaSynthesisService.class);

    private static final String OP_TAG = "sintetizar";

    private static final String SYSTEM_PROMPT = """
            Você é um assistente especializado em redigir atas de reunião em português formal.
            A partir da transcrição fornecida, produza uma ata estruturada em texto com as seguintes secções:

            TÍTULO
            DATA
            PARTICIPANTES
            PAUTA
            DISCUSSÃO
            DECISÕES
            ITENS DE AÇÃO (responsável | tarefa | prazo)
            PRÓXIMOS PASSOS

            Seja objetivo, profissional e completo. Não invente informação que não esteja na transcrição.
            """;

    private final ChatClient chatClient;
    private final MeterRegistry meterRegistry;

    public AtaSynthesisService(ChatClient.Builder chatClientBuilder, MeterRegistry meterRegistry) {
        this.chatClient = chatClientBuilder.defaultSystem(SYSTEM_PROMPT).build();
        this.meterRegistry = meterRegistry;
    }

    public String sintetizar(AtaRequest request) {
        log.info("sintetizar | Iniciando síntese da ata para título [{}]", request.title());
        log.debug("sintetizar | Transcrição recebida com [{}] caracteres para título [{}]",
                request.transcript().length(), request.title());

        String userMessage = "Título da reunião: " + request.title() + "\n\nTranscrição:\n" + request.transcript();

        log.debug("sintetizar | Prompt montado com [{}] caracteres, enviando ao modelo", userMessage.length());

        Timer.Sample sample = Timer.start(meterRegistry);

        ChatResponse chatResponse = chatClient.prompt()
                .user(userMessage)
                .call()
                .chatResponse();

        long tempoNs = sample.stop(meterRegistry.timer("scribe.ai.call.duration", "operation", OP_TAG));
        long tempoMs = TimeUnit.NANOSECONDS.toMillis(tempoNs);

        logModelMetadata(chatResponse.getMetadata(), tempoMs);

        String resultado = chatResponse.getResult().getOutput().getText();

        log.info("sintetizar | Síntese concluída para título [{}], ata gerada com [{}] caracteres em [{}ms]",
                request.title(), resultado != null ? resultado.length() : 0, tempoMs);

        return resultado;
    }

    private void logModelMetadata(ChatResponseMetadata metadata, long tempoMs) {
        String modelo = metadata != null ? metadata.getModel() : "desconhecido";
        Usage usage = metadata != null ? metadata.getUsage() : null;

        if (usage != null) {
            Integer promptTokens = usage.getPromptTokens();
            Integer completionTokens = usage.getCompletionTokens();
            Integer totalTokens = usage.getTotalTokens();

            log.info("sintetizar | Modelo [{}] respondeu em [{}ms] — tokens: prompt=[{}], completion=[{}], total=[{}]",
                    modelo, tempoMs, promptTokens, completionTokens, totalTokens);

            meterRegistry.counter("scribe.ai.tokens.prompt", "operation", OP_TAG)
                    .increment(promptTokens != null ? promptTokens : 0);
            meterRegistry.counter("scribe.ai.tokens.completion", "operation", OP_TAG)
                    .increment(completionTokens != null ? completionTokens : 0);
        } else {
            log.info("sintetizar | Modelo [{}] respondeu em [{}ms] — dados de tokens não disponíveis para este provider",
                    modelo, tempoMs);
        }
    }
}
