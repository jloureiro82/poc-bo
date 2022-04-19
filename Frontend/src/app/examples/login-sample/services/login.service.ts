import { Injectable } from '@angular/core';
import { of, tap, map, BehaviorSubject } from 'rxjs'

const token_key = 'token'
const EMPTY = ''
@Injectable({
  providedIn: 'root'
})
export class LoginService {
  private token = new BehaviorSubject<string>(EMPTY);
  constructor() {
    this.token.next(localStorage.getItem(token_key) || EMPTY)
    this.token.subscribe(token => localStorage.setItem(token_key, token))
   }

  doLogin({email, password}: any) {
    return of({email, password}).pipe(
      tap(values => console.log('tapping', values)),
      map(request => request.password === "valid" ? {token: "mock"} : {error: "invalid username or password"}),
      tap(response => {
        if (response.token) {
          this.token.next(response.token)
        }
      })
    )
  }

  hasToken() {
    return this.token.value !== EMPTY
  }

  getToken() {
    return this.token.value
  }

  loginObserver() {
    return this.token
    .asObservable()
    .pipe(
      map(value => value !== EMPTY)
    )
  }

  doLogout() {
    this.token.next(EMPTY)
  }
}
