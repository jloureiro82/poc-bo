import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { JsonFormControls } from 'src/app/shared/multistep/models/multistep-route/JsonFormControls';
import { RootForm } from 'src/app/shared/multistep/models/multistep-route/RootForm';
import { FormGroupValidator } from '../validators/FormGroupValidator';

@Injectable({
  providedIn: 'root'
})
export class MultistepService {
  private formData: any;
  public myEntireForm!: FormGroup;
  public formgroup1!: FormGroup;
  public formgroup2!: FormGroup;


  constructor(private http: HttpClient, private _fb: FormBuilder) { 
    
  }

  // init() {
  //   this.http
  //   .get('/assets/multistep/multistep-form.json')
  //   .subscribe((form2Data) => {
  //     this.formData$.next(form2Data);
  //     console.log('service: '+ JSON.stringify(this.formData$));
  //   });
  // }

  async getFormData() {
    console.log('MultistepComponent1~: '+JSON.stringify(this.formData));
    return firstValueFrom(this.http.get<RootForm>('/assets/multistep/multistep-form.json'));
  }

  async getJsonData() {
    // return this.http.get<Root>('/assets/multistep/multistep-form.json');
    return this.http
      .get('/assets/multistep/multistep-form.json')
      .subscribe((data) => {
        console.log('MultistepComponent2~: '+JSON.stringify(data));
        this.formData = data;
      });
  }

  async getMultiStepFormData() {
    await this.getJsonData();
    return this.formData;
  }


  getAllStepsForm() : FormGroup{
    this.createForm1(this.formData.steps[0].step1.controls);
      this.createForm2(this.formData.steps[0].step2.controls);

    return this._fb.group({
      step1: this.formgroup1,
      step2: this.formgroup2
    });
    
  }

  createForm1(controls: JsonFormControls[]) {
    console.log('form1 '+ JSON.stringify(controls))
    for (const control of controls) {
      const validatorsToAdd = FormGroupValidator.validationForm(control);
      this.formgroup1.addControl(
        control.name,
        this._fb.control(control.value, validatorsToAdd)
      );
    }
  }

  createForm2(controls: JsonFormControls[]) {
    console.log('form2 '+ JSON.stringify(controls))
    for (const control of controls) {
      const validatorsToAdd = FormGroupValidator.validationForm(control);
      this.formgroup2.addControl(
        control.name,
        this._fb.control(control.value, validatorsToAdd)
      );
    }
  }
  
}
