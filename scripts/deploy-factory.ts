import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const identityImplementation = await ethers.deployContract("Identity", [
    deployer.address,
    true,
  ]);
  console.log(
    `Deploying identity implementation at ${await identityImplementation.getAddress()} ...`
  );
  await identityImplementation.waitForDeployment();
  console.log(
    `Deployed identity implementation at ${await identityImplementation.getAddress()}`
  );

  const implementationAuthority = await ethers.deployContract(
    "ImplementationAuthority",
    [await identityImplementation.getAddress()]
  );
  console.log(
    `Deploying implementation authority at ${await implementationAuthority.getAddress()} ...`
  );
  await implementationAuthority.waitForDeployment();
  console.log(
    `Deployed implementation authority at ${await implementationAuthority.getAddress()}`
  );

  const factory = await ethers.deployContract("IdFactory", [
    await implementationAuthority.getAddress(),
  ]);
  console.log(`Deploying factory at ${await factory.getAddress()} ...`);
  await factory.waitForDeployment();
  console.log(`Deployed factory at ${await factory.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
