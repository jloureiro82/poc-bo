import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { StoreModule } from '@ngrx/store';
import { ReduxPageComponent } from './components/redux-page/redux-page.component';
import { exampleReducer } from './reducers/example.reducer';
import { EffectsModule } from '@ngrx/effects';
import { ExampleEffects } from './effects/example.effect';



@NgModule({
  declarations: [
    ReduxPageComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    StoreModule.forRoot({}),
    StoreModule.forFeature('example', exampleReducer),
    EffectsModule.forRoot([]),  
    EffectsModule.forFeature([ExampleEffects]) 
  ]
})
export class ReduxModule { }
