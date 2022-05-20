import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map, of, zipWith } from 'rxjs'
import { FormSetup } from '../model/form-setup';
import { certTypesConfig } from './cert-config';

@Injectable({
  providedIn: 'root'
})
export class ConfigStoreService {

  constructor() { }

  getCertForm(certName: string) {
    return of(certTypesConfig[certName] || {name: 'default', forms: []})
  }

  loadPrefilledForm(type: string) {
    return of({})
  }

  jsonToFormGroup(json: object) {
    return new FormGroup({})
  }

  getFormSetup(certName: string) {
    console.log('build new form')
    //get configuration
    return this.getCertForm(certName).pipe(
      zipWith(
        //load preview json form from backend/storage
        this.loadPrefilledForm(certName)
        //convert json to formGroup
        .pipe(map(this.jsonToFormGroup))
    ),
    map(([configuration, form]) => new FormSetup(certName, form, configuration)),
  )
  //return FormSetup with formGroup pre-filled and dynamic validations to be injected into html forms
  }
}
