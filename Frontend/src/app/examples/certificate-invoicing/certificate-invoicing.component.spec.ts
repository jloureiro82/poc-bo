import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CertificateInvoicingComponent } from './certificate-invoicing.component';

describe('CertificateInvoicingComponent', () => {
  let component: CertificateInvoicingComponent;
  let fixture: ComponentFixture<CertificateInvoicingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CertificateInvoicingComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CertificateInvoicingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
