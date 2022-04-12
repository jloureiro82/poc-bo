import { createReducer, on } from "@ngrx/store";
import { exampleFeedbackAction, exampleRequestAction } from "../actions/example.action";

export const exampleReducer = createReducer(
    {result: 'reducer'},
    on(exampleRequestAction, (state, {payload}) => ({ ...state, query: payload, result: '', loading: true })),
    on(exampleFeedbackAction, (state, {payload}) => ({ ...state, result: payload, loading: false }))
)