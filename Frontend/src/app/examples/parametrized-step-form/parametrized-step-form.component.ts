import { Component, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-parametrized-step-form',
  templateUrl: './parametrized-step-form.component.html',
  styleUrls: ['./parametrized-step-form.component.css']
})
export class ParametrizedStepFormComponent implements OnInit {

  formType!: string
  form = new FormGroup({})

  constructor(private activatedRoute: ActivatedRoute) {
    this.activatedRoute.queryParamMap
    .subscribe(params => this.formType = params.get('type') || 'default')
  }
  
  ngOnInit(): void {
  }

}
