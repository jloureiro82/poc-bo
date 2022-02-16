package com.multicert.labs.cvc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Provider;
import java.security.SecureRandom;
import java.security.Security;

import javax.crypto.Cipher;

import org.apache.commons.cli.CommandLine;
import org.apache.commons.cli.CommandLineParser;
import org.apache.commons.cli.DefaultParser;
import org.apache.commons.cli.Option;
import org.apache.commons.cli.Options;
import org.apache.commons.codec.binary.Hex;
import org.bouncycastle.asn1.pkcs.RSAPublicKey;
import org.bouncycastle.asn1.x509.SubjectPublicKeyInfo;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.pkcs.PKCS10CertificationRequest;

import com.safenetinc.luna.LunaSlotManager;
import com.safenetinc.luna.provider.LunaProvider;

public class CvcIssuer {

	public static final byte[] CPI = new byte[] { 0x0D };

	public static final byte[] CAR = new byte[] { 0x50, 0x54, 0x47, 0x4F, 0x56, 0x10, 0x11, 0x06 };    // IAS 0.7

	//public static final byte[] CAR = new byte[] { 0x50, 0x54, 0x47, 0x4F, 0x56, 0x10, 0x12, 0x06 };   // IAS 1.0.1

	//public static final byte[] CAR = new byte[] { 0x50, 0x54, 0x43, 0x6F, 0x41, 0x10, 0x12, 0x06 };

	public static final byte[] CHR_PREFIX = new byte[] { 0x00, 0x00, 0x00, 0x00 };

	public static final byte[] CHR_TERMINAL_ID_DEFAULT = new byte[] { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01 };

	public static final byte[] AID = new byte[] { 0x01, 0x02, 0x03, 0x04, 0x05, 0x06 };

	public static final byte[] ROLE = new byte[] { 0x01 };  // 0x01 (update role) ; 0x02 (read role)

	public static final byte[] OID = new byte[] { 0x2B, 0x24, 0x07, 0x02, 0x01, 0x02 };
	
	public static final String RSA_OID = "1.2.840.113549.1.1.1";
	
	public static final String PKCS_PADDING = "PKCS1Padding"; // PKCS1Padding, PKCS1v1_5

	public static final String NO_PADDING = "NoPadding"; // NoPadding

	public static void main(String[] args) throws Exception {
		CommandLineParser parser = new DefaultParser();
		CommandLine cmdLine = parser.parse(createCommandLineOptions(), args);

		int slot = 0;
		if(cmdLine.hasOption("slot")) {
			slot = Integer.parseInt(cmdLine.getOptionValue("slot"));
		}
        String password = cmdLine.getOptionValue("password");
        String pad = cmdLine.getOptionValue("pad");
        byte[] termID = new byte[] { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01 };
        if(cmdLine.hasOption("term")) {
        	 byte[] argTermID = Hex.decodeHex(cmdLine.getOptionValue("term"));
        	 if(argTermID.length <= 8) {
        		 System.arraycopy(argTermID, 0, termID, 8 - argTermID.length, argTermID.length);
        	 } else {
        		 System.arraycopy(argTermID, argTermID.length - 8, termID, 0, 8);
        	 }
        } else {
        	termID = CHR_TERMINAL_ID_DEFAULT;
        }
        byte[] role = Hex.decodeHex(cmdLine.getOptionValue("role"));
        boolean ias101 = cmdLine.hasOption("ias101");

        byte[] csrBytes = Files.readAllBytes(Paths.get(cmdLine.getOptionValue("csr")));
        PKCS10CertificationRequest csr = new PKCS10CertificationRequest(csrBytes);
        SubjectPublicKeyInfo spki = csr.getSubjectPublicKeyInfo();
        
        String keyAlgo = spki.getAlgorithm().getAlgorithm().getId();
		ByteArrayOutputStream baos = new ByteArrayOutputStream();
        RSAPublicKey rsaPubKey;
        byte[] modulus, exponent;
        int keyLength;
        
        if(keyAlgo.equals(RSA_OID)) {
        	rsaPubKey = RSAPublicKey.getInstance(spki.parsePublicKey());
        	keyLength = rsaPubKey.getModulus().bitLength();
        	modulus = rsaPubKey.getModulus().toByteArray();
        	baos.write(modulus, modulus.length - (keyLength / 8), keyLength / 8); // negative BigInteger (leftmost bit = 1) are encoded with and extra leading 0x00 byte
        	modulus = baos.toByteArray();
        	exponent = rsaPubKey.getPublicExponent().toByteArray();
        	baos.reset();
        	baos.write(0x00);
        	baos.write(exponent);
        	exponent = baos.toByteArray();
        } else {
        	throw new Exception("Key in CSR must be RSA. Found key is " + keyAlgo);
        }
        
		byte[] message, m1, m2, toBeSigned, digest;

		baos.reset();
		baos.write(CPI);
		baos.write(CAR);
		baos.write(CHR_PREFIX);
		baos.write(termID);
		baos.write(AID);
		if(ias101) {
			baos.write(0xFF);
		}
		baos.write(role);
		baos.write(OID);
		baos.write(modulus);
		baos.write(exponent);
		
		message = baos.toByteArray();
		
		System.out.println("Message (length=" + message.length + " bytes): " + Hex.encodeHexString(message));

		MessageDigest md = MessageDigest.getInstance("SHA1");
		digest = md.digest(message);
		
		boolean pkcsPadding = pad.equals(PKCS_PADDING);

		baos.reset();
		baos.write(CPI);
		baos.write(CAR);
		baos.write(CHR_PREFIX);
		baos.write(termID);
		baos.write(AID);
		if(ias101) {
			baos.write(0xFF);
		}
		baos.write(role);
		baos.write(OID);
		baos.write(modulus, 0, 72 - (pkcsPadding ? 11 : 0) - (ias101 ? 1 : 0) );
		m1 = baos.toByteArray();
		
		System.out.println("M1 (length=" + m1.length + " bytes): " + Hex.encodeHexString(m1));

		baos.reset();
		baos.write(modulus, 72 - (pkcsPadding ? 11 : 0)  - (ias101 ? 1 : 0), modulus.length - (72 - (pkcsPadding ? 11 : 0) - (ias101 ? 1 : 0)));
		baos.write(exponent);
		m2 = baos.toByteArray();
		
		System.out.println("M2 (length=" + m2.length + " bytes): " + Hex.encodeHexString(m2));
		
		baos.reset();
		baos.write(0x6A);
		baos.write(m1);
		baos.write(digest);
		baos.write(0xBC);
		toBeSigned = baos.toByteArray();
		
		System.out.println("To be signed (length=" + toBeSigned.length + " bytes): " + Hex.encodeHexString(toBeSigned));

		LunaSlotManager luna = null;
		Provider provider;
		PrivateKey privKey;
		
		if(cmdLine.hasOption("luna")) {
			Security.insertProviderAt(new LunaProvider(), 2);
			luna = LunaSlotManager.getInstance();
			luna.login(slot, password);
			provider = LunaProvider.getInstance();
			LunaSlotManager.getInstance().login(Integer.parseInt(cmdLine.getOptionValue("slot")), cmdLine.getOptionValue("password"));
			
			ByteArrayInputStream slotBAIS = new ByteArrayInputStream(("slot:" + cmdLine.getOptionValue("slot")).getBytes());
			KeyStore ks = KeyStore.getInstance("Luna");
			ks.load(slotBAIS, cmdLine.getOptionValue("password").toCharArray());
			privKey = (PrivateKey) ks.getKey(cmdLine.getOptionValue("alias"), cmdLine.getOptionValue("password").toCharArray());
			
		} else {
			provider = new BouncyCastleProvider();
			Security.addProvider(provider);
			SecureRandom rand = SecureRandom.getInstanceStrong();
			KeyPairGenerator kpgen = KeyPairGenerator.getInstance("RSA",  provider);
			KeyPair kp;
			kpgen.initialize(keyLength, rand);
			kp = kpgen.generateKeyPair();
			privKey = kp.getPrivate();
		}

		try {

			Cipher cipher = Cipher.getInstance("RSA/NONE/" + pad, provider);
			cipher.init(Cipher.ENCRYPT_MODE, privKey);
			byte[] certSign = cipher.doFinal(toBeSigned);
			
			System.out.println("CertSign (length=" + certSign.length + " bytes): " + Hex.encodeHexString(certSign));

			baos.reset();
			baos.write(new byte[] { 0x7F, 0x21, (byte) 0x81, (byte) (certSign.length + m2.length + CAR.length + 9), 0x5F, 0x37, (byte) 0x81, (byte) 0x80 });
			baos.write(certSign); // CERTSIGN
			baos.write(new byte[] { 0x5F, 0x38, (byte) m2.length });
			baos.write(m2); // PKREM
			baos.write(new byte[] { 0x42, (byte) CAR.length });
			baos.write(CAR);
			
			byte[] cvc = baos.toByteArray();
			if(cmdLine.hasOption("out")) {
				FileOutputStream fos = new FileOutputStream(new File(cmdLine.getOptionValue("out")));
				fos.write(cvc);
				fos.close();
		    }
	    	System.out.println("CVC (length=" + cvc.length + " bytes): " + Hex.encodeHexString(cvc));
			
		} catch(Exception e) {
			e.printStackTrace();
		} finally {
			if(luna != null) {
				luna.logout();
			}
		}
	}

	public static final Options createCommandLineOptions() {
		Options options = new Options();
		Option slot = Option.builder("slot").argName("slot").hasArg().desc("slot number in HSM").build();
		Option password = Option.builder("password").argName("password").hasArg().desc("HSM partition password").build();
		Option alias = Option.builder("alias").argName("alias").hasArg().desc("Key alias in HSM").build();
		Option padding = Option.builder("pad").argName("pad").hasArg().desc("RSA padding, possible values are [ " + NO_PADDING + " | " + PKCS_PADDING + " ]").build();
		Option csr = Option.builder("csr").argName("csr").hasArg().desc("CSR (PKCS#10) file in DER format").build();
		Option role = Option.builder("role").argName("role").hasArg().desc("Role: 1 - update, 2 - read").build();
		Option termID = Option.builder("term").argName("term").hasArg().desc("terminal ID, in hexadecimal (8 bytes, i.e. 16 hex digits)").build();
		Option out = Option.builder("out").argName("out").hasArg().desc("output file for the CVC").build();
		
		options.addOption(slot);
		options.addOption(password);
		options.addOption(alias);
		options.addOption(padding);
		options.addOption(csr);
		options.addOption(role);
		options.addOption(termID);
		options.addOption(out);
		options.addOption("luna", false, "use Luna HSM, otherwise, software implementation");
		options.addOption("ias101", false, "issue CVC certificate according to IAS 1.0.1, otherwise IAS 0.7");
		
		return options;
	}
}
