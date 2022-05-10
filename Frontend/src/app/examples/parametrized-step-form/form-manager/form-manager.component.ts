import { Component, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-form-manager',
  templateUrl: './form-manager.component.html',
  styleUrls: ['./form-manager.component.css']
})
export class FormManagerComponent implements OnInit {

  formType!: string
  form = new FormGroup({})

  constructor(private activatedRoute: ActivatedRoute) {
    this.activatedRoute.queryParamMap
    .subscribe(params => this.formType = params.get('type') || 'default')
   }

  ngOnInit(): void { }
  subform(name: string) {
    const subform = this.form.get(name) as FormGroup || new FormGroup({})
    this.form.addControl(name, subform)
    return subform
  }
}

