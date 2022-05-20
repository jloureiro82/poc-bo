import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import {
  FormBuilder,
  FormControlOptions,
  FormGroup,
  ValidatorFn
} from '@angular/forms';
import { JsonFormControls } from 'src/app/shared/multistep/models/multistep-route/JsonFormControls';
import { JsonFormData } from 'src/app/shared/multistep/models/multistep1/JsonFormData';
import { FormGroupValidator } from 'src/app/shared/validators/FormGroupValidator';

@Component({
  selector: 'app-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormComponent implements OnChanges  {
  @Input()
  jsonFormData!: JsonFormData;

  public myForm: FormGroup = this.fb.group({});

  // personalDetails!: FormGroup;
  // addressDetails!: FormGroup;
  // educationalDetails!: FormGroup;
  // personal_step = false;
  // address_step = false;
  // education_step = false;
  // step = 1;

  constructor(private fb: FormBuilder) {  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['jsonFormData'].firstChange) {
      // console.log(' 2 ' + this.jsonFormData);
      this.createForm(this.jsonFormData.controls);
    }
  }


  createForm(controls: any[]) {
    // console.log(controls)
    for (const control of controls) {
      console.log('validatorsToAdd: ', control)
      const validatorsToAdd = FormGroupValidator.validationForm(control);
  
      this.myForm.addControl(
        control.name,
        this.fb.control(control.value, validatorsToAdd)
      );
      // console.log(this.myForm)
    }
  }

  submit(){
    console.log('Form valid: ', );
    console.log('Form values: ', );

    // if(this.step==3){
    //   this.education_step = true;
    //   if (this.educationalDetails.invalid) { return }
    // }
  }

}
