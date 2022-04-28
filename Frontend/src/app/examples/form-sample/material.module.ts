import { NgModule } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatNativeDateModule } from '@angular/material/core'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

@NgModule({
  imports: [
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    BrowserAnimationsModule,
    MatNativeDateModule
  ],
  exports: [
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    BrowserAnimationsModule,
    MatNativeDateModule
  ],
  providers: [ MatDatepickerModule ],
})

export class MaterialModule {}