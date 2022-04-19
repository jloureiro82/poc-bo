import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { LoginService } from '../../services/login.service';

const EMAIL_REGEX = /^([a-zA-Z0-9_\-\.]+)@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.)|(([a-zA-Z0-9\-]+\.)+))([a-zA-Z]{1,5}|[0-9]{1,3})(\]?)$/

@Component({
  selector: 'app-login-form',
  templateUrl: './login-form.component.html',
  styleUrls: ['./login-form.component.css']
})
export class LoginFormComponent implements OnInit {

  public form = new FormGroup({
    email: new FormControl(''),
    password: new FormControl('')
  })

  public logged = false
  constructor(private loginService: LoginService) {
    loginService.loginObserver().subscribe(isLogged => this.logged = isLogged)
   }

  emailValidation() {
    if (this.form.get('email')?.value.trim().match(EMAIL_REGEX) === null) {
      return {invalid: true}
    }
    return null
  }

  passwordValidation() {
    if(this.form.get('password')?.value.trim() === ''){
      return {invalid: true};
    }
    return null
  }

  ngOnInit(): void {
  }

  doSubmit(event: SubmitEvent) {
    event.preventDefault()
    this.form.get('email')?.setErrors(this.emailValidation())
    this.form.get('password')?.setErrors(this.passwordValidation())
    console.log(this.form)
    if (this.form.valid) {
      this.loginService.doLogin(this.form.value).subscribe()
    }
  }

  doLogout() {
    this.loginService.doLogout()
  }

}
