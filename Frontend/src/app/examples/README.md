# **Examples details**


# dynamic-grid-sample

# internationalization-sample

# form-layout-sample
POC to a component of a page with main content and a side content as existing in 3WS pages

# form-sample
POC of a multi-step(wizard) form template using component to do the navigation and better example of formGroup usage passing through sub-components

# store-service-sample & redux
POCs of solutions for state management, the service approach may be easier to start but must be analysed the need in the project

## store-service
 a simpler solution using services as storage of information, don't require extra libs or modules. This solution works with some complex flows also using the rxjs lib

## redux
a sample using redux lib and patterns to understand how to implement and integrate on projects using reducers, actions, effects and redux stores.

# login-sample
POC of a login page template implementing tilt-effect directive and basic forms (better form example on form-sample)


# **Index**
- custom text input 
    - component `examples/form-sample/form-input`
    - usage sample `examples/form-sample/step1`
    - [explanation article integrating formControl](https://medium.com/joolsoftware/creating-a-custom-formcontrol-in-angular-da92f2f47733)
- custom dropdown
    - component `shared/form-dropdown`
    - usage sample `examples/form-sample/step2`
- splited view 
    - component `shared/form-layout/components/form-layout`
    - directives `shared/form-layout/directive/[main-view, side-view]`
    - usage sample `examples/form-layout-sample/`
- component with injected children
    - component sample `examples/form-sample/multi-step-form`
    - other sample `examples/form-layout-sample`
- datepicker 
    - TODO
- multi-step form navigation
    - component sample `examples/form-sample/multi-step-form`