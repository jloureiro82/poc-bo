import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, Pipe, PipeTransform, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { JsonFormControls } from 'src/app/shared/multistep/models/multistep-route/JsonFormControls';
import { RootForm } from 'src/app/shared/multistep/models/multistep-route/RootForm';
import { MultistepService } from 'src/app/shared/multistep/multistep.service';
import { FormGroupValidator } from 'src/app/shared/validators/FormGroupValidator';

@Component({
  selector: 'app-form3',
  templateUrl: './form3.component.html',
  styleUrls: ['./form3.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Form3Component implements OnChanges {
  isLinear = false;
  @Input()
  public formInput!: RootForm;

  public myForm: FormGroup = this.fb.group({});
  public firstFormGroup: FormGroup = this.fb.group({});
  public secondFormGroup: FormGroup = this.fb.group({});

  public controlsStep1!: any[]
  public controlsStep2!: any[]

  constructor(private fb: FormBuilder, private multistepService: MultistepService) { }

  ngOnChanges(changes: SimpleChanges) {
    console.log(' 22231 ' + JSON.stringify(this.formInput));
    if (!changes['formInput'].firstChange) {
      this.controlsStep1 = this.formInput.steps[0].step1.controls;
      this.controlsStep2 = this.formInput.steps[0].step2.controls;
       this.createForm(this.controlsStep1);
       this.createForm(this.controlsStep2);
      // this.secondFormGroup = this.fb.group({
      //   secondCtrl: this.secondFormGroup
      // });
      
      console.log(this.formInput.steps[0].step1);
      console.log(this.myForm.controls);
    }
  }

  createForm(controls: JsonFormControls[]) {
    console.log('form1 '+ JSON.stringify(controls))
    for (const control of controls) {
      const validatorsToAdd = FormGroupValidator.validationForm(control);
      this.myForm.addControl(
        control.name,
        this.fb.control(control.value, validatorsToAdd)
      );
    }
  }


  submit(){
    console.log('Form valid: ', );
    console.log('Form values: ', this.myForm.value);
  }


  log(value: any){
    console.log(value);
  }


}
