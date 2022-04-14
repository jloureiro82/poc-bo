import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormLayoutModule } from './form-layout/form-layout.module';
import { HandlersModule } from './handlers/handlers.module';
import { MessagesModule } from './messages/messages.module';



@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormLayoutModule,
    HandlersModule,
    MessagesModule
  ],
  exports: [
    FormLayoutModule
  ]
})
export class SharedModule { }
