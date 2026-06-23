package com.multicert.components.scribeservice.model;

import java.util.List;

public record Ata(
        String title,
        String date,
        List<String> participants,
        List<String> agenda,
        List<String> discussion,
        List<String> decisions,
        List<ActionItem> actionItems,
        List<String> nextSteps
) {}
