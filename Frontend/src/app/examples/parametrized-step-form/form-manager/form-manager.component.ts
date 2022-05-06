import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ConfigStoreService } from '../services/config-store.service';
import { map, mergeMap } from 'rxjs'
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-form-manager',
  templateUrl: './form-manager.component.html',
  styleUrls: ['./form-manager.component.css']
})
export class FormManagerComponent implements OnInit {

  formState!: FormLayout
  form = new FormGroup({})

  constructor(private service: ConfigStoreService, private activatedRoute: ActivatedRoute) { }

  ngOnInit(): void {
    this.activatedRoute.queryParamMap.pipe(
      map(params => params.get('type') || 'default'),
      mergeMap(type => this.service.getCertForm(type))
    ).subscribe(cert => {
      this.formState = cert
      console.log('resumoo', this)
    })
  }

}

