import { Injectable } from "@angular/core";
import { Actions, createEffect } from "@ngrx/effects";
import { switchMap, filter, map, tap } from "rxjs";
import { ExampleActions, ExampleActionTypes, ExampleFeedbackAction } from "../actions/example.action";
import { ExampleService } from "../services/example.service";

@Injectable()
export class ExampleEffects {

  constructor(
    private actions$: Actions,
    private service: ExampleService
  ) { }

    exampleEffect$ = createEffect(() => {
        return this.actions$.pipe(
            tap(console.log),
            filter(action => action.type === ExampleActionTypes.EXAMPLE_REQUEST),
            tap(response => console.log('part response', response)),
            switchMap((action) => this.service.getExample((action as ExampleActions).payload)),
            map(response => new ExampleFeedbackAction(response))
        )
    })
}
