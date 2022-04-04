import { Action } from "@ngrx/store";

export enum ExampleActionTypes {
  EXAMPLE_REQUEST = 'EXAMPLE_REQUEST',
  EXAMAPLE_FEEDBACK = 'EXAMPLE_FEEDBACK'
}

export class ExampleRequestAction implements Action {
    readonly type = ExampleActionTypes.EXAMPLE_REQUEST;
    constructor(public payload: string) {}
}

export class ExampleFeedbackAction implements Action {
    readonly type = ExampleActionTypes.EXAMAPLE_FEEDBACK;
    constructor(public payload: string) {}
}

export type ExampleActions = ExampleRequestAction | ExampleFeedbackAction;