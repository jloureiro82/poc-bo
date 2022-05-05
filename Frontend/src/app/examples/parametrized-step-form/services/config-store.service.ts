import { Injectable } from '@angular/core';
import { BehaviorSubject, map, filter } from 'rxjs'

const CONFIG: cfg = {
  certificates: [
    {
      name: 'type A',
      forms: [
        {name: 'contact'},
        {name: 'customization'},
        {name: 'payment'}
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
      map(cert => cert || {name: 'default', forms: []})
    )
  }
}
