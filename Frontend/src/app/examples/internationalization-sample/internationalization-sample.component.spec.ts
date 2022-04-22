import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InternationalizationSampleComponent } from './internationalization-sample.component';

describe('InternationalizationSampleComponent', () => {
  let component: InternationalizationSampleComponent;
  let fixture: ComponentFixture<InternationalizationSampleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ InternationalizationSampleComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(InternationalizationSampleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
