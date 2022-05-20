import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { RootForm } from 'src/app/shared/multistep/models/multistep-route/RootForm';

@Component({
  selector: 'app-form2',
  templateUrl: './form2.component.html',
  styleUrls: ['./form2.component.css']
})
export class Form2Component implements OnInit {
  public myForm: FormGroup = this.fb.group({});
  public form2Data!: any;
  product: any;

  @Input()
  public formInput!: RootForm;

  constructor(private fb: FormBuilder, private router:Router, private activatedRoute:ActivatedRoute) {
    // console.log('ada: '+ this.activatedRoute.data);
    // console.log(this.router.);

   }

  ngOnInit(): void {
    console.log('Form valid: ', history.state);
    this.product=history.state;
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
