import { ChangeDetectionStrategy, Component, Input, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControlOptions, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { JsonFormControls } from 'src/app/shared/multistep/models/multistep-route/JsonFormControls';
import { RootForm } from 'src/app/shared/multistep/models/multistep-route/RootForm';
import { MultistepService } from 'src/app/shared/multistep/multistep.service';
import { FormGroupValidator } from 'src/app/shared/validators/FormGroupValidator';


@Component({
  selector: 'app-form2',
  templateUrl: './form2.component.html',
  styleUrls: ['./form2.component.css'],
  // changeDetection: ChangeDetectionStrategy.OnPush
})
export class Form2Component implements OnInit {
  // material stepper 
  isLinear = true;
  firstFormGroup!: FormGroup;
  secondFormGroup!: FormGroup;

  public myForm: FormGroup = this.fb.group({});

  config: RootForm | undefined;

  ngOnInit() {
    console.log('bla: '+ this.config)

    // this.createForm(this.jsonForm2Data.step2.controls);
    this.firstFormGroup = this.fb.group({
      firstCtrl: ['', Validators.required],
    });
    this.secondFormGroup = this.fb.group({
      secondCtrl: ['', Validators.required],
    });
  }

  constructor(private fb: FormBuilder, private multistepService: MultistepService) { 
    // console.log(' form 2 contruct: ' + JSON.stringify(this.jsonForm2Data)); 
  }

  createForm(controls: JsonFormControls[]) {
    console.log('form2'+ controls)
    for (const control of controls) {
      const validatorsToAdd = FormGroupValidator.validationForm(control);
      
      this.secondFormGroup.addControl(
        control.name,
        this.fb.control(control.value, validatorsToAdd)
      );
      console.log(this.secondFormGroup)
    }
  }
}
