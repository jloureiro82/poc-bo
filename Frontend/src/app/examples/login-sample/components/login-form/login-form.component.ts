import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';

const EMAIL_REGEX = /^([a-zA-Z0-9_\-\.]+)@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.)|(([a-zA-Z0-9\-]+\.)+))([a-zA-Z]{1,5}|[0-9]{1,3})(\]?)$/

@Component({
  selector: 'app-login-form',
  templateUrl: './login-form.component.html',
  styleUrls: ['./login-form.component.css']
})
export class LoginFormComponent implements OnInit {

  email = new FormControl('')
  password = new FormControl('')
  constructor() {
    

   }
  emailValidation() {
    if (this.email.value.trim().match(EMAIL_REGEX) == null) {
      return {invalid: true}
    }
    return null
  }

  passwordValidation() {
    if(this.password.value.trim() == ''){
      return {invalid: true};
    }
    return null
  }

  ngOnInit(): void {
  }

  doSubmit(event: SubmitEvent) {
    event.preventDefault()
    this.email.setErrors(this.emailValidation())
    this.password.setErrors(this.passwordValidation())
    console.log(this.email)
  }

}
