import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SettingsService } from './settings.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(SettingsService).settings().token;
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
