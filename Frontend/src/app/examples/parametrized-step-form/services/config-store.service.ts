import { Injectable } from '@angular/core';
import { BehaviorSubject, map, tap } from 'rxjs'

const CONFIG: cfg = {
  certificates: [
    {
      name: 'type A',
      forms: [
        {name: 'contact', fields: ['fieldA', 'fieldC']},
        {name: 'customization', fields: ['fieldC']},
        {name: 'payment', fields: ['fieldA', 'fieldB']}
      ]
    },
    {
      name: 'type B',
      forms: [
        {name: 'payment', fields: ['fieldC']},
        {name: 'contact', fields: ['fieldA']},
      ]
    }
  ]
}

@Injectable({
  providedIn: 'root'
})
export class ConfigStoreService {

  private config = new BehaviorSubject(CONFIG)
  constructor() { }

  getConfig() {
    return this.config.asObservable()
  }

  getCertForm(certName: string) {
    return this.config.pipe(
      map(config => config.certificates.filter(cert => cert.name === certName).pop()),
      map(cert => cert || {name: 'default', forms: []}),
    )
  }
}
