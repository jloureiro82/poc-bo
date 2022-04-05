import { createAction, props } from "@ngrx/store";

export const exampleRequestAction = createAction('EXAMPLE_REQUEST', props<{payload: string}>())
export const exampleFeedbackAction = createAction('EXAMPLE_FEEDBACK', props<{payload: string}>())
