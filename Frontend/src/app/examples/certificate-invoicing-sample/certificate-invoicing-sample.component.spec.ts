import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CertificateInvoicingSampleComponent } from './certificate-invoicing-sample.component';

describe('CertificateInvoicingSampleComponent', () => {
  let component: CertificateInvoicingSampleComponent;
  let fixture: ComponentFixture<CertificateInvoicingSampleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CertificateInvoicingSampleComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CertificateInvoicingSampleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
