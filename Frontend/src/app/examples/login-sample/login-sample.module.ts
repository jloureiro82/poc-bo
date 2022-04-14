import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoginSampleComponent } from './login-sample.component';
import { CardViewComponent } from './components/card-view/card-view.component';
import { AnimatedImageComponent } from './components/animated-image/animated-image.component';
import { LoginFormComponent } from './components/login-form/login-form.component';
import { TextInputComponent } from './components/text-input/text-input.component';
import { BrowserModule } from '@angular/platform-browser';
import { SubmitButtonComponent } from './components/submit-button/submit-button.component';
import { TiltEffectDirective } from './directives/tilt-effect.directive';
import { ReactiveFormsModule } from '@angular/forms';



@NgModule({
  declarations: [
    LoginSampleComponent,
    CardViewComponent,
    AnimatedImageComponent,
    LoginFormComponent,
    TextInputComponent,
    SubmitButtonComponent,
    TiltEffectDirective
  ],
  imports: [
    CommonModule, BrowserModule, ReactiveFormsModule
  ],
  exports: [
    LoginSampleComponent
  ]
})
export class LoginSampleModule { }
