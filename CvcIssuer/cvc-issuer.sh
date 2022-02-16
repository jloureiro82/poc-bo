#!/bin/bash

java -cp "lib/cvc-issuer.jar:lib/commons-codec-1.15.jar:lib/bcprov-jdk15on-169.jar:lib/LunaProvider.jar:lib/commons-cli-1.5.0.jar:lib/bcpkix-jdk15on-169.jar:lib/bcutil-jdk15on-169.jar" com.multicert.labs.cvc.CvcIssuer $@