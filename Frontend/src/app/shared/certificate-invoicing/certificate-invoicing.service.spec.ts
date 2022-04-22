import { TestBed } from '@angular/core/testing';

import { CertificateInvoicingService } from './certificate-invoicing.service';

describe('CertificateInvoicingService', () => {
  let service: CertificateInvoicingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CertificateInvoicingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
